use crate::{
    js_utils::{js_array, js_error, to_js_value},
    network::com_hub::JSComHub,
};
#[cfg(feature = "debug")]
use datex::{
    decompiler::decompile_value,
    dif::{
        interface::{
            DIFApplyError, DIFCreatePointerError, DIFInterface,
            DIFObserveError, DIFResolveReferenceError, DIFUpdateError,
        },
        reference::DIFReference,
        r#type::DIFTypeDefinition,
        update::{DIFUpdate, DIFUpdateData},
        value::DIFValueContainer,
    },
    global::{
        dxb_block::DXBBlock,
        protocol_structures::block_header::{BlockHeader, FlagsAndTimestamp},
    },
    references::{
        observers::{ObserveOptions, TransceiverId},
        reference::ReferenceMutability,
    },
    runtime::{
    },
    serde::deserializer::DatexDeserializer,
    values::{
        core_values::endpoint::Endpoint, pointer::PointerAddress,
        value_container::ValueContainer,
    },
};
use std::borrow::Cow;

use crate::js_utils::cast_from_dif_js_value;
use datex::{crypto::CryptoImpl, runtime::{Runtime, RuntimeConfig, RuntimeRunner, memory::Memory}};
use js_sys::Function;
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{Error, from_value};
use std::{cell::RefCell, fmt::Display, rc::Rc, str::FromStr, sync::Arc};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{future_to_promise, spawn_local};
use web_sys::js_sys::Promise;

#[wasm_bindgen(getter_with_clone)]
pub struct JSRuntime {
    runtime: Runtime,
    pub com_hub: JSComHub,
}

// #[derive(Serialize, Deserialize, Default)]
// pub struct JSDebugFlags {
//     pub allow_unsigned_blocks: Option<bool>,
//     pub enable_deterministic_behavior: Option<bool>,
// }

// #[cfg(feature = "debug")]
// impl From<JSDebugFlags> for DebugFlags {
//     fn from(val: JSDebugFlags) -> Self {
//         DebugFlags {
//             allow_unsigned_blocks: val.allow_unsigned_blocks.unwrap_or(false),
//             enable_deterministic_behavior: val
//                 .enable_deterministic_behavior
//                 .unwrap_or(false),
//         }
//     }
// }

#[derive(Debug, PartialEq)]
enum ConversionError {
    InvalidValue,
}
impl Display for ConversionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConversionError::InvalidValue => write!(f, "Invalid value"),
        }
    }
}

/**
 * Internal impl of the JSRuntime, not exposed to JavaScript
 */
impl JSRuntime {
    pub fn runtime(&self) -> &Runtime {
        &self.runtime
    }

    pub fn run(
        config: JsValue,
        // debug_flags: Option<JSDebugFlags>,
    ) -> JSRuntime {
        // NOTE: mock memory is used here, since we don't have an initialized runtime yet - so no pointers can be resolved during config parsing
        // We must think about a better way to handle this in the future
        let config: RuntimeConfig =
            cast_from_dif_js_value(config, &RefCell::new(Memory::default()))
                .unwrap();
        let runtime_runner = RuntimeRunner::new(config);
        spawn_local(runtime_runner.task_future);
        return Self::new(runtime_runner.runtime.clone());
    }

    fn new(runtime: Runtime) -> JSRuntime {
        let com_hub = JSComHub::new(runtime.clone());
        JSRuntime {
            runtime,
            com_hub,
        }
    }
}

/**
 * Exposed properties and methods for JavaScript
 */
#[wasm_bindgen]
impl JSRuntime {
    pub async fn crypto_test_tmp(&self) -> Promise {
        future_to_promise(async move {
            let something = b"yellow submarineyellow submarine".to_owned();
            let some_check =
                b"9At2nzU19GjL8F4WFRyB7RZSGLemMGUMVBZAMChfndF2".to_owned();

            let based = CryptoImpl::enc_b58(&something).unwrap();
            let unbased = CryptoImpl::dec_b58(&some_check).unwrap();
            assert_eq!(something, unbased);
            assert_eq!(some_check, based);

            // Hashes
            let mut ikm = Vec::from([0u8; 32]);
            let hash = CryptoImpl::hash_sha256(&ikm).await.unwrap();
            assert_eq!(
                hash,
                [
                    102, 104, 122, 173, 248, 98, 189, 119, 108, 143, 193, 139,
                    142, 159, 142, 32, 8, 151, 20, 133, 110, 226, 51, 179, 144,
                    42, 89, 29, 13, 95, 41, 37
                ]
            );
            let salt = Vec::from([0u8; 16]);
            let hash_a = CryptoImpl::hkdf_sha256(&ikm, &salt).await.unwrap();
            ikm[0] = 1u8;
            let hash_b = CryptoImpl::hkdf_sha256(&ikm, &salt).await.unwrap();
            assert_ne!(hash_a, hash_b);
            assert_ne!(hash_a.to_vec(), ikm);
            assert_eq!(
                hash_a,
                [
                    223, 114, 4, 84, 111, 27, 238, 120, 184, 83, 36, 167, 137,
                    140, 161, 25, 179, 135, 224, 19, 134, 209, 174, 240, 55,
                    120, 29, 74, 138, 3, 106, 238
                ]
            );

            // Checks gen_ed25519, sig_ed25519, ver_ed25519 against itself
            let data = b"Some message to  sign".to_vec();
            let other_data = b"Some message to sign".to_vec();

            // Generate key and signature
            let (pub_key, pri_key) = CryptoImpl::gen_ed25519().await.unwrap();
            assert_eq!(pub_key.len(), 44_usize);
            assert_eq!(pri_key.len(), 48_usize);

            let sig = CryptoImpl::sig_ed25519(&pri_key, &data).await.unwrap();
            assert_eq!(sig.len(), 64_usize);

            // Verify key, signature and data
            let ver = CryptoImpl::ver_ed25519(&pub_key, &sig, &data).await.unwrap();
            assert!(ver);

            // Falsify other data
            let ver = CryptoImpl::ver_ed25519(&pub_key, &sig, &other_data)
                .await
                .unwrap();
            assert!(!ver);

            // Falsify other key
            let (other_pub_key, other_pri_key) =
                CryptoImpl::gen_ed25519().await.unwrap();
            let ver = CryptoImpl::ver_ed25519(&other_pub_key, &sig, &data)
                .await
                .unwrap();
            assert!(!ver);

            // Falsify other signature
            let other_sig =
                crypto.sig_ed25519(&other_pri_key, &data).await.unwrap();
            let ver = crypto
                .ver_ed25519(&pub_key, &other_sig, &data)
                .await
                .unwrap();
            assert!(!ver);

            // ECDH derivation
            let (ser_pub, ser_pri) = crypto.gen_x25519().await.unwrap();
            let (cli_pub, cli_pri) = crypto.gen_x25519().await.unwrap();
            assert_eq!(ser_pub.len(), 44_usize);
            assert_eq!(ser_pri.len(), 48_usize);

            let cli_sec =
                CryptoImpl::derive_x25519(&cli_pri, &ser_pub).await.unwrap();
            let ser_sec =
                CryptoImpl::derive_x25519(&ser_pri, &cli_pub).await.unwrap();

            assert_eq!(cli_sec, ser_sec);
            assert_eq!(cli_sec.len(), 32_usize);

            // AES CTR with random key
            let random_bytes: [u8; 32] =
                CryptoImpl::random_bytes(32).try_into().unwrap();

            let msg: Vec<u8> = b"Some message".to_vec();
            let ctr_iv: [u8; 16] = [0u8; 16];

            let ctr_ciphered = crypto
                .aes_ctr_encrypt(&random_bytes, &ctr_iv, &msg)
                .await
                .unwrap();

            let ctr_deciphered = crypto
                .aes_ctr_decrypt(&random_bytes, &ctr_iv, &ctr_ciphered)
                .await
                .unwrap();

            assert_eq!(msg, ctr_deciphered);
            assert_ne!(msg, ctr_ciphered);

            // AES key wrapping
            let wrapped = crypto
                .key_upwrap(&random_bytes, &random_bytes)
                .await
                .unwrap();
            let unwrapped =
                crypto.key_unwrap(&random_bytes, &wrapped).await.unwrap();

            assert_eq!(random_bytes.to_vec(), unwrapped);
            // assert_ne!(wrapped, unwrapped);

            let js_array = js_array(&[
                hash.to_vec(),
                hash_a.to_vec(),
                hash_b.to_vec(),
                ser_pub.to_vec(),
                pub_key.to_vec(),
                cli_sec.to_vec(),
                ser_sec.to_vec(),
                random_bytes.to_vec(),
                wrapped.to_vec(),
                unwrapped.to_vec(),
            ]);
            Ok(js_array)
        })
    }

    #[wasm_bindgen(getter)]
    pub fn version(&self) -> String {
        self.runtime.version.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn endpoint(&self) -> String {
        self.runtime.endpoint().to_string()
    }

    pub fn _create_block(
        &self,
        body: Option<Vec<u8>>,
        receivers: Vec<String>,
    ) -> Vec<u8> {
        let mut block = DXBBlock {
            block_header: BlockHeader {
                flags_and_timestamp: FlagsAndTimestamp::default()
                    .with_is_end_of_context(true)
                    .with_is_end_of_section(true),
                ..BlockHeader::default()
            },
            body: body.unwrap_or_default(),
            ..DXBBlock::default()
        };

        block.recalculate_struct();
        block.set_receivers(
            receivers
                .iter()
                .map(|r| Endpoint::from_str(r))
                .collect::<Result<Vec<Endpoint>, _>>()
                .unwrap(),
        );
        block.to_bytes()
    }

    pub async fn start(&self) {
        self.runtime.start().await;
    }

    pub async fn execute_with_string_result(
        &self,
        script: &str,
        dif_values: Option<Vec<JsValue>>,
        decompile_options: JsValue,
    ) -> Result<String, JsError> {
        let val = &self
            .js_values_to_value_containers(dif_values)
            .map_err(js_error)?;
        let result = self
            .runtime
            .execute(script, val, None)
            .await
            .map_err(js_error)?;
        match result {
            None => Ok("".to_string()),
            Some(result) => Ok(decompile_value(
                &result,
                from_value(decompile_options).unwrap_or_default(),
            )),
        }
    }

    pub async fn execute(
        &self,
        script: &str,
        dif_values: Option<Vec<JsValue>>,
    ) -> Result<JsValue, JsValue> {
        let result = self
            .runtime
            .execute(
                script,
                &self
                    .js_values_to_value_containers(dif_values)
                    .map_err(js_error)?,
                None,
            )
            .await
            .map_err(js_error)?;
        Ok(self.maybe_value_container_to_dif(result))
    }

    pub fn execute_sync_with_string_result(
        &self,
        script: &str,
        dif_values: Option<Vec<JsValue>>,
        decompile_options: JsValue,
    ) -> Result<String, JsValue> {
        let input = self
            .runtime
            .execute_sync(
                script,
                &self
                    .js_values_to_value_containers(dif_values)
                    .map_err(js_error)?,
                None,
            )
            .map_err(js_error)?;
        match input {
            None => Ok("".to_string()),
            Some(result) => Ok(decompile_value(
                &result,
                from_value(decompile_options).unwrap_or_default(),
            )),
        }
    }

    pub fn execute_sync(
        &self,
        script: &str,
        dif_values: Option<Vec<JsValue>>,
    ) -> Result<JsValue, JsValue> {
        let result = self
            .runtime
            .execute_sync(
                script,
                &self
                    .js_values_to_value_containers(dif_values)
                    .map_err(js_error)?,
                None,
            )
            .map_err(js_error)?;
        Ok(self.maybe_value_container_to_dif(result))
    }

    pub fn value_to_string(
        &self,
        dif_value: JsValue,
        decompile_options: JsValue,
    ) -> Result<String, JsError> {
        let value_container = self
            .js_value_to_value_container(dif_value)
            .map_err(js_error)?;
        Ok(decompile_value(
            &value_container,
            from_value(decompile_options).unwrap_or_default(),
        ))
    }

    fn maybe_value_container_to_dif(
        &self,
        maybe_value_container: Option<ValueContainer>,
    ) -> JsValue {
        match maybe_value_container {
            None => JsValue::NULL,
            Some(value_container) => {
                let dif_value_container =
                    DIFValueContainer::from_value_container(
                        &value_container,
                        self.runtime.memory(),
                    );
                to_js_value(&dif_value_container).unwrap()
            }
        }
    }

    fn js_values_to_value_containers(
        &self,
        js_values: Option<Vec<JsValue>>,
    ) -> Result<Vec<ValueContainer>, ConversionError> {
        js_values
            .unwrap_or_default()
            .into_iter()
            .map(|js_value| self.js_value_to_value_container(js_value))
            .collect()
    }

    /// Convert a JsValue (DIFValue) to a ValueContainer
    /// Returns Err(()) if the conversion fails (invalid json or ref not found)
    fn js_value_to_value_container(
        &self,
        js_value: JsValue,
    ) -> Result<ValueContainer, ConversionError> {
        // convert JsValue to DIFValue
        let dif_value: DIFValueContainer = from_value(js_value).unwrap();
        // convert DIFValue to ValueContainer
        if let Ok(value_container) =
            dif_value.to_value_container(self.runtime.memory())
        {
            Ok(value_container)
        } else {
            // ref not found
            Err(ConversionError::InvalidValue)
        }
    }

    /// Get a handle to the DIF interface of the runtime
    pub fn dif(&self) -> RuntimeDIFHandle {
        RuntimeDIFHandle {
            internal: self.runtime.internal.clone(),
        }
    }

    /// Start the LSP server, returning a JS function to send messages to Rust
    #[cfg(feature = "lsp")]
    pub fn start_lsp(&self, send_to_js: js_sys::Function) -> js_sys::Function {
        use crate::lsp::start_lsp;
        start_lsp(self.runtime.clone(), send_to_js)
    }
}

#[wasm_bindgen]
pub struct RuntimeDIFHandle {
    internal: Rc<RuntimeInternal>,
}

#[wasm_bindgen]
impl RuntimeDIFHandle {
    fn js_value_to_pointer_address(
        address: &str,
    ) -> Result<PointerAddress, JsError> {
        PointerAddress::try_from(address)
            .map_err(|_| js_error(ConversionError::InvalidValue))
    }

    pub fn observe_pointer(
        &self,
        transceiver_id: TransceiverId,
        address: &str,
        observe_options: JsValue,
        callback: &Function,
    ) -> Result<u32, JsError> {
        let address = RuntimeDIFHandle::js_value_to_pointer_address(address)?;
        let cb = callback.clone();
        let observe_options: ObserveOptions =
            from_value(observe_options).map_err(js_error)?;
        let observer = move |update_data: &DIFUpdateData,
                             source_id: TransceiverId| {
            let js_value = to_js_value(&DIFUpdate {
                source_id,
                data: Cow::Borrowed(update_data),
            })
            .unwrap();
            let _ = cb.call1(&JsValue::NULL, &js_value);
        };
        self.internal
            .observe_pointer(transceiver_id, address, observe_options, observer)
            .map_err(js_error)
    }

    pub fn unobserve_pointer(
        &self,
        address: &str,
        observer_id: u32,
    ) -> Result<(), JsError> {
        let address = RuntimeDIFHandle::js_value_to_pointer_address(address)?;
        DIFInterface::unobserve_pointer(self, address, observer_id)
            .map_err(js_error)
    }

    pub fn update_observer_options(
        &self,
        address: &str,
        observer_id: u32,
        observe_options: JsValue,
    ) -> Result<(), JsError> {
        let address = RuntimeDIFHandle::js_value_to_pointer_address(address)?;
        let observe_options: ObserveOptions =
            from_value(observe_options).map_err(js_error)?;
        DIFInterface::update_observer_options(
            self,
            address,
            observer_id,
            observe_options,
        )
        .map_err(js_error)
    }

    pub fn update(
        &mut self,
        transceiver_id: TransceiverId,
        address: &str,
        update: JsValue,
    ) -> Result<(), JsError> {
        let address = Self::js_value_to_pointer_address(address)?;
        let dif_update_data: DIFUpdateData =
            from_value(update).map_err(js_error)?;
        DIFInterface::update(self, transceiver_id, address, &dif_update_data)
            .map_err(js_error)
    }

    pub fn apply(
        &mut self,
        callee: JsValue,
        value: JsValue,
    ) -> Result<JsValue, JsError> {
        let dif_callee: DIFValueContainer =
            from_value(callee).map_err(js_error)?;
        let dif_value: DIFValueContainer =
            from_value(value).map_err(js_error)?;
        let result = DIFInterface::apply(self, dif_callee, dif_value)
            .map_err(js_error)?;
        to_js_value(&result).map_err(js_error)
    }

    pub fn create_pointer(
        &self,
        value: JsValue,
        allowed_type: JsValue,
        mutability: u8,
    ) -> Result<String, JsError> {
        let dif_value: DIFValueContainer =
            from_value(value).map_err(js_error)?;
        let dif_allowed_type: Option<DIFTypeDefinition> =
            if allowed_type.is_null() || allowed_type.is_undefined() {
                None
            } else {
                Some(from_value(allowed_type).map_err(js_error)?)
            };
        let dif_mutability = ReferenceMutability::try_from(mutability)
            .map_err(|_| js_error(ConversionError::InvalidValue))?;
        let address = DIFInterface::create_pointer(
            self,
            dif_value,
            dif_allowed_type,
            dif_mutability,
        )
        .map_err(js_error)?;
        Ok(address.to_address_string())
    }

    /// Resolve a pointer address synchronously if it's in memory, otherwise return an error
    pub fn resolve_pointer_address_sync(
        &self,
        address: &str,
    ) -> Result<JsValue, JsError> {
        let address = Self::js_value_to_pointer_address(address)?;
        let result =
            DIFInterface::resolve_pointer_address_in_memory(self, address)
                .map_err(js_error)?;
        to_js_value(&result).map_err(js_error)
    }

    /// Resolve a pointer address, returning a Promise
    /// If the pointer is in memory, the promise resolves immediately
    /// If the pointer is not in memory, it will be loaded first
    pub fn resolve_pointer_address(
        &self,
        address: &str,
    ) -> Result<JsValue, JsError> {
        if let Ok(sync) = self.resolve_pointer_address_sync(address) {
            return Ok(sync);
        }
        let address = Self::js_value_to_pointer_address(address)?;
        let runtime = self.internal.clone();
        Ok(future_to_promise(async move {
            let result = runtime
                .resolve_pointer_address_external(address)
                .await
                .map_err(js_error)?;
            Ok(to_js_value(&result).map_err(js_error)?)
        })
        .unchecked_into())
    }
}

impl DIFInterface for RuntimeDIFHandle {
    fn update(
        &self,
        source_id: TransceiverId,
        address: PointerAddress,
        update: &DIFUpdateData,
    ) -> Result<(), DIFUpdateError> {
        self.internal.update(source_id, address, update)
    }

    async fn resolve_pointer_address_external(
        &self,
        address: PointerAddress,
    ) -> Result<DIFReference, DIFResolveReferenceError> {
        self.internal
            .resolve_pointer_address_external(address)
            .await
    }

    fn resolve_pointer_address_in_memory(
        &self,
        address: PointerAddress,
    ) -> Result<DIFReference, DIFResolveReferenceError> {
        self.internal.resolve_pointer_address_in_memory(address)
    }

    fn apply(
        &self,
        callee: DIFValueContainer,
        value: DIFValueContainer,
    ) -> Result<DIFValueContainer, DIFApplyError> {
        self.internal.apply(callee, value)
    }

    fn create_pointer(
        &self,
        value: DIFValueContainer,
        allowed_type: Option<DIFTypeDefinition>,
        mutability: ReferenceMutability,
    ) -> Result<PointerAddress, DIFCreatePointerError> {
        self.internal
            .create_pointer(value, allowed_type, mutability)
    }

    fn observe_pointer(
        &self,
        transceiver_id: TransceiverId,
        address: PointerAddress,
        options: ObserveOptions,
        observer: impl Fn(&DIFUpdateData, TransceiverId) + 'static,
    ) -> Result<u32, DIFObserveError> {
        self.internal.observe_pointer(
            transceiver_id,
            address,
            options,
            observer,
        )
    }

    fn unobserve_pointer(
        &self,
        address: PointerAddress,
        observer_id: u32,
    ) -> Result<(), DIFObserveError> {
        self.internal.unobserve_pointer(address, observer_id)
    }

    fn update_observer_options(
        &self,
        address: PointerAddress,
        observer_id: u32,
        options: ObserveOptions,
    ) -> Result<(), DIFObserveError> {
        self.internal
            .update_observer_options(address, observer_id, options)
    }
}

#[cfg(test)]
mod tests {}
