use crate::{
    dif::JSDIFInterface,
    js_utils::{from_js_value_with_context, js_array, js_error, to_js_value},
    network::com_hub::JSComHub,
};
use datex_core::{
    self,
    decompiler::decompile_value,
    dif::pointer_address::PointerAddressWithOwnership,
    global::{
        dxb_block::DXBBlock,
        protocol_structures::block_header::{BlockHeader, FlagsAndTimestamp},
    },
    shared_values::observers::{ObserveOptions, TransceiverId},
    values::{
        core_values::endpoint::Endpoint, value::Value,
        value_container::ValueContainer,
    },
};
use datex_crypto_facade::crypto::Crypto;
use std::{borrow::Cow, ops::Deref};

use datex_core::{
    compiler::{CompileOptions, compile_template},
    crypto::CryptoImpl,
    dif::dif_interface::DIFInterface,
    runtime::{
        Runtime, RuntimeConfig, RuntimeInternal, RuntimeRunner, memory::Memory,
    },
    shared_values::{
        PointerAddress, SelfOwnedPointerAddress, SharedContainerMutability,
    },
    value_updates::update_data::Update,
};
use js_sys::{Function, Uint8Array};
use serde_wasm_bindgen::from_value;
use std::{cell::RefCell, fmt::Display, rc::Rc};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{future_to_promise, spawn_local};
use web_sys::js_sys::Promise;

#[wasm_bindgen(getter_with_clone)]
pub struct JSRuntime {
    runtime: Runtime,
    pub com_hub: JSComHub,
    pub dif_interface: JSDIFInterface,
}

/**
 * Internal impl of the JSRuntime, not exposed to JavaScript
 */
impl JSRuntime {
    pub fn runtime(&self) -> &Runtime {
        &self.runtime
    }

    pub(crate) async fn run(config: JsValue) -> JSRuntime {
        let config: RuntimeConfig =
            cast_from_dif_js_value(config, &RefCell::new(Memory::new()))
                .unwrap();
        let runtime_runner = RuntimeRunner::new(config);
        // Note: JSRuntime::new must be called before runtime run to initialize com interface factories
        let js_runtime = JSRuntime::new(runtime_runner.runtime.clone());

        let (initialized_sender, initialized_receiver) =
            futures::channel::oneshot::channel();

        spawn_local(async {
            runtime_runner
                .run_forever(async |_| {
                    // Runtime is initialized and ready to use, we can now resolve the promise and return the JSRuntime instance to JavaScript
                    let _ = initialized_sender.send(());
                })
                .await;
        });
        initialized_receiver.await.unwrap();
        js_runtime
    }

    fn new(runtime: Runtime) -> JSRuntime {
        let com_hub = JSComHub::new(runtime.clone());
        let dif_interface = JSDIFInterface::new(runtime.create_dif_interface());
        JSRuntime {
            runtime,
            com_hub,
            dif_interface,
        }
    }
}

/**
 * Exposed properties and methods for JavaScript
 */
#[wasm_bindgen]
impl JSRuntime {
    // TODO remove @janiejestemja
    pub async fn crypto_test_tmp(&self) -> Promise {
        future_to_promise(async move {
            let something = b"yellow submarineyellow submarine".to_owned();
            let some_check =
                "9At2nzU19GjL8F4WFRyB7RZSGLemMGUMVBZAMChfndF2".to_owned();

            let based = CryptoImpl::enc_b58(&something).as_bytes().to_vec();
            let unbased = CryptoImpl::dec_b58_32(&some_check).unwrap();
            assert_eq!(something, unbased);
            assert_eq!(some_check.as_bytes().to_vec(), based);

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
            let ver = CryptoImpl::ver_ed25519(&pub_key, &sig, &data)
                .await
                .unwrap();
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
            let other_sig = CryptoImpl::sig_ed25519(&other_pri_key, &data)
                .await
                .unwrap();
            let ver = CryptoImpl::ver_ed25519(&pub_key, &other_sig, &data)
                .await
                .unwrap();
            assert!(!ver);

            // ECDH derivation
            let (ser_pub, ser_pri) = CryptoImpl::gen_x25519().await.unwrap();
            let (cli_pub, cli_pri) = CryptoImpl::gen_x25519().await.unwrap();
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

            let ctr_ciphered =
                CryptoImpl::aes_ctr_encrypt(&random_bytes, &ctr_iv, &msg)
                    .await
                    .unwrap();

            let ctr_deciphered = CryptoImpl::aes_ctr_decrypt(
                &random_bytes,
                &ctr_iv,
                &ctr_ciphered,
            )
            .await
            .unwrap();

            assert_eq!(msg, ctr_deciphered);
            assert_ne!(msg, ctr_ciphered);

            // AES key wrapping
            let wrapped =
                CryptoImpl::key_wrap_rfc3394(&random_bytes, &random_bytes)
                    .await
                    .unwrap();
            let unwrapped =
                CryptoImpl::key_unwrap_rfc3394(&random_bytes, &wrapped)
                    .await
                    .unwrap();
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
        self.runtime.version().to_string()
    }

    #[wasm_bindgen(getter)]
    pub fn endpoint(&self) -> String {
        self.runtime.endpoint().to_string()
    }

    /// Execute a DATEX script with optional inserted values, returning the result as a string
    pub async fn execute_with_string_result(
        &self,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
        decompile_options: JsValue,
    ) -> Result<String, JsError> {
        let val = &self.js_values_to_value_containers(inserted_values)?;
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

    /// Executes a DATEX script with inserted values, returning the result as DIFValue
    pub async fn execute(
        &self,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
    ) -> Result<Option<JsValue>, JsError> {
        let result = self
            .runtime
            .execute(
                script,
                &self.js_values_to_value_containers(inserted_values)?,
                None,
            )
            .await
            .map_err(js_error)?;
        result.map(|value| to_js_value(&value)).transpose()
    }

    pub fn execute_sync_with_string_result(
        &self,
        script: &str,
        dif_values: Option<Vec<JsValue>>,
        decompile_options: JsValue,
    ) -> Result<String, JsError> {
        let input = self
            .runtime
            .execute_sync(
                script,
                &self.js_values_to_value_containers(dif_values)?,
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
    ) -> Result<Option<JsValue>, JsError> {
        let result = self
            .runtime
            .execute_sync(
                script,
                &self.js_values_to_value_containers(dif_values)?,
                None,
            )
            .map_err(js_error)?;
        result.map(|e| to_js_value(&e)).transpose()
    }

    pub fn value_to_string(
        &self,
        dif_value: JsValue,
        decompile_options: JsValue,
    ) -> Result<String, JsError> {
        let value_container = self.js_value_to_value_container(dif_value)?;
        Ok(decompile_value(
            &value_container,
            from_value(decompile_options).unwrap_or_default(),
        ))
    }

    /// Converts a list of [JsValue]s to a list of [ValueContainer], using the DIF cache for resolving shared containers if necessary
    fn js_values_to_value_containers(
        &self,
        js_values: Option<Vec<JsValue>>,
    ) -> Result<Vec<ValueContainer>, JsError> {
        js_values
            .unwrap_or_default()
            .into_iter()
            .map(|js_value| self.js_value_to_value_container(js_value))
            .collect()
    }

    /// Convert a [JsValue] (DIFValue) to a ValueContainer
    /// Returns an error if the [JsValue] cannot be converted to a [ValueContainer]
    fn js_value_to_value_container(
        &self,
        value: JsValue,
    ) -> Result<ValueContainer, JsError> {
        from_js_value_with_context::<ValueContainer>(
            value,
            &mut self.dif_interface.cache(),
        )
    }

    /// Get a handle to the DIF interface of the runtime
    pub fn dif_interface(&self) -> JSDIFInterface {
        self.dif_interface.clone()
    }

    /// Compiles a DATEX script with optional inserted values to a DXB body
    pub async fn compile(
        &self,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
    ) -> Result<Vec<u8>, JsValue> {
        let (bytes, _) = compile_template(
            script,
            self.js_values_to_value_containers(inserted_values)?
                .into_iter()
                .map(Some)
                .collect::<Vec<_>>()
                .as_slice(),
            CompileOptions::default(),
            self.runtime.clone(),
        )
        .map_err(js_error)?;
        Ok(bytes)
    }

    /// Start the LSP server, returning a JS function to send messages to Rust
    #[cfg(feature = "lsp")]
    pub fn start_lsp(&self, send_to_js: js_sys::Function) -> js_sys::Function {
        use crate::lsp::start_lsp;
        start_lsp(self.runtime.clone(), send_to_js)
    }
}

#[cfg(test)]
mod tests {}
