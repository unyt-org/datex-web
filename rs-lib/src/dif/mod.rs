use crate::js_utils::{
    deserializable_from_js_value, from_js_dif, js_error,
    optional_value_container_to_optional_js_dif_value, to_js_dif,
    unwrap_or_report_js_error_debug,
};
use datex_core::{
    core_compiler::instruction_input::InstructionInput,
    dif::{
        dif_interface::DIFInterface, error::DIFUpdateError,
        pointer_address::PointerAddressWithOwnership,
    },
    instruction::regular_instruction::RegularInstruction,
    runtime::{Runtime, cache::shared_values_cache::SharedValuesCache},
    shared_values::{
        PointerAddress, SharedContainer, SharedContainerOwnership,
        base_shared_value_container::{
            BaseSharedValueContainer,
            observers::{ObserveOptions, ObserverId, TransceiverId},
        },
        traits::SharedContainerCommon,
    },
    traits::apply::{ApplyArgument, get_borrowed_apply_argument_values},
    types::type_definition::callable::{CallableKind, CallableTypeDefinition},
    value_updates::{update_data::Update, update_handler::UpdateHandler},
    values::{
        core_values::{callable::NativeCallable, endpoint::Endpoint},
        value_container::ValueContainer,
    },
};
use js_sys::{Array, Function, Promise};
use std::{
    cell::{RefCell, RefMut},
    ops::DerefMut,
    rc::Rc,
};
use wasm_bindgen::{JsError, JsValue, prelude::*};

#[wasm_bindgen]
#[derive(Clone)]
pub struct JSDIFInterface {
    #[wasm_bindgen(skip)]
    dif_interface: Rc<DIFInterface>,
    #[wasm_bindgen(skip)]
    runtime: Runtime,
}

impl JSDIFInterface {
    pub fn new(runtime: Runtime, dif_interface: DIFInterface) -> Self {
        Self {
            dif_interface: Rc::new(dif_interface),
            runtime,
        }
    }
    pub fn shared_values_cache(&self) -> &RefCell<SharedValuesCache> {
        &self.dif_interface.cache
    }

    /// Get a clone of the Rc<RefCell<DIFInterface>> to allow sharing the DIFInterface across multiple JS objects.
    pub fn dif_interface_rc(&self) -> Rc<DIFInterface> {
        self.dif_interface.clone()
    }
}

#[wasm_bindgen]
impl JSDIFInterface {
    pub fn observe_pointer(
        &self,
        address: &str,
        observe_options: JsValue,
        callback: &Function,
    ) -> Result<u32, JsError> {
        let address = PointerAddress::try_from(address).map_err(js_error)?;
        let cb = callback.clone();
        let observe_options: ObserveOptions =
            deserializable_from_js_value(observe_options)?;
        let self_clone = self.clone();
        let observer = move |update: &Update| {
            let value = to_js_dif(
                update,
                &self_clone.dif_interface.cache,
                self_clone.runtime.shared_references_cache_refcell(),
            );
            let _ = unwrap_or_report_js_error_debug(
                cb.call1(&JsValue::NULL, &value),
            );
        };
        self.dif_interface
            .observe_pointer(address, observe_options, observer)
            .map_err(js_error)
            .map(|id| id.0)
    }

    pub fn unobserve_pointer(
        &self,
        address: &str,
        observer_id: u32,
    ) -> Result<(), JsError> {
        let address = PointerAddress::try_from(address).map_err(js_error)?;
        self.dif_interface
            .unobserve_pointer(address, ObserverId(observer_id))
            .map_err(js_error)
    }

    pub fn update_observer_options(
        &self,
        address: &str,
        observer_id: u32,
        observe_options: JsValue,
    ) -> Result<(), JsError> {
        let address = PointerAddress::try_from(address).map_err(js_error)?;
        let observe_options: ObserveOptions =
            deserializable_from_js_value(observe_options)?;
        self.dif_interface
            .update_observer_options(
                address,
                ObserverId(observer_id),
                observe_options,
            )
            .map_err(js_error)
    }

    /// Applies a DIF update on a shared container at the given address, using the provided update data.
    /// TODO: Can we optimize this, by not returning the update result data back to JS, as it adds unnecessary overhead, as
    /// we can access the values in JS before update.
    pub fn update(
        &self,
        address: &str,
        update: JsValue,
    ) -> Result<JsValue, JsError> {
        let address = PointerAddress::try_from(address).map_err(js_error)?;
        let update: Update = from_js_dif(
            update,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        )?;

        let shared_container = self
            .dif_interface
            .cache
            .borrow()
            .try_get_shared_container_mutable_reference(&address)
            .map_err(js_error)?;

        let result = SharedContainer::Referenced(shared_container)
            .try_handle_update(
                update,
                self.runtime.shared_references_cache_refcell(),
            )
            .map_err(DIFUpdateError::UpdateError)
            .map_err(js_error)?;

        Ok(to_js_dif(
            &result,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub fn register_callable(
        &self,
        callable: &Function,
        name: Option<String>,
        signature: JsValue,
        is_method: bool, // TODO
    ) -> Result<String, JsError> {
        let signature: CallableTypeDefinition = from_js_dif(
            signature,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        )?;

        let callable_clone = callable.clone();
        let self_clone = self.clone();
        let native_callable = if signature.requires_async {
            NativeCallable::new_async(
                move |args: Vec<ApplyArgument>, runtime| {
                    let callable_clone = callable_clone.clone();
                    let self_clone = self_clone.clone();
                    Box::pin(async move {
                        let js_args = args
                            .iter()
                            .map(|v| {
                                to_js_dif(
                                    &v.value,
                                    &self_clone.dif_interface.cache,
                                    self_clone
                                        .runtime
                                        .shared_references_cache_refcell(),
                                )
                            })
                            .collect::<Array>();
                        let promise = unwrap_or_report_js_error_debug(
                            callable_clone.call1(&JsValue::NULL, &js_args),
                        )
                        .map(Promise::from);
                        let res = match promise {
                            Some(promise) => {
                                let result = unwrap_or_report_js_error_debug(
                                    wasm_bindgen_futures::JsFuture::from(
                                        promise,
                                    )
                                    .await,
                                );
                                result.map(|res| {
                                    from_js_dif::<ValueContainer>(
                                        res,
                                        &self_clone.dif_interface.cache,
                                        self_clone
                                            .runtime
                                            .shared_references_cache_refcell(),
                                    )
                                    .unwrap()
                                })
                            }
                            None => {
                                panic!(
                                    "Callable did not return a Promise, but signature requires async"
                                )
                            }
                        };

                        Ok((res, get_borrowed_apply_argument_values(args)))
                    })
                },
            )
        } else {
            NativeCallable::new_sync(
                move |args: Vec<ApplyArgument>, runtime| {
                    let js_args = args
                        .iter()
                        .map(|v| {
                            to_js_dif(
                                &v.value,
                                &self_clone.dif_interface.cache,
                                self_clone
                                    .runtime
                                    .shared_references_cache_refcell(),
                            )
                        })
                        .collect::<Array>();
                    let result = unwrap_or_report_js_error_debug(
                        callable_clone.call1(&JsValue::NULL, &js_args),
                    );
                    // TODO: handle promise (convert to DATEX task)
                    if result.is_some()
                        && result.as_ref().unwrap().is_instance_of::<Promise>()
                    {
                        panic!(
                            "Callable returned a Promise, but signature does not require async"
                        )
                    }
                    let res = result.map(|res| {
                        from_js_dif::<ValueContainer>(
                            res,
                            &self_clone.dif_interface.cache,
                            self_clone
                                .runtime
                                .shared_references_cache_refcell(),
                        )
                        .unwrap()
                    });

                    Ok((res, get_borrowed_apply_argument_values(args)))
                },
            )
        };

        Ok(self
            .dif_interface
            .register_callable(native_callable, name, signature)
            .to_address_string())
    }

    pub fn apply_sync(
        &self,
        callee: JsValue,
        args: JsValue,
    ) -> Result<JsValue, JsError> {
        let (callee, args) =
            self.get_callee_and_args_from_js_values(callee, args)?;

        let (res, _) = self
            .dif_interface
            .apply_sync(&self.runtime, callee, args)
            .map_err(js_error)?;

        Ok(optional_value_container_to_optional_js_dif_value(
            res,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub async fn apply_async(
        &self,
        callee: JsValue,
        args: JsValue,
    ) -> Result<JsValue, JsError> {
        let (callee, args) =
            self.get_callee_and_args_from_js_values(callee, args)?;

        let (res, _) = self
            .dif_interface
            .clone()
            .apply_async(&self.runtime, callee, args)
            .await
            .map_err(js_error)?;

        Ok(optional_value_container_to_optional_js_dif_value(
            res,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub fn call_method_sync(
        &self,
        callee: JsValue,
        method_name: String,
        args: JsValue,
    ) -> Result<JsValue, JsError> {
        let (callee, args) =
            self.get_callee_and_args_from_js_values(callee, args)?;

        let (res, _) = self
            .dif_interface
            .call_method_sync(&self.runtime, callee, method_name, args)
            .map_err(js_error)?;

        Ok(optional_value_container_to_optional_js_dif_value(
            res,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub async fn call_method_async(
        &self,
        callee: JsValue,
        method_name: String,
        args: JsValue,
    ) -> Result<JsValue, JsError> {
        let (callee, args) =
            self.get_callee_and_args_from_js_values(callee, args)?;

        let (res, _) = self
            .dif_interface
            .clone()
            .call_method_async(&self.runtime, callee, method_name, args)
            .await
            .map_err(js_error)?;

        Ok(optional_value_container_to_optional_js_dif_value(
            res,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    fn get_callee_and_args_from_js_values(
        &self,
        callee: JsValue,
        args: JsValue,
    ) -> Result<(ValueContainer, Vec<ApplyArgument>), JsError> {
        let callee: ValueContainer = from_js_dif(
            callee,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        )?;
        let js_array: Array = args.into();
        let args = js_array
            .to_vec()
            .into_iter()
            .map(|v| {
                from_js_dif::<ValueContainer>(
                    v,
                    &self.shared_values_cache(),
                    self.runtime.shared_references_cache_refcell(),
                )
                .map(|v| ApplyArgument::from(v))
            })
            .collect::<Result<Vec<ApplyArgument>, _>>()?;
        Ok((callee, args))
    }

    pub fn create_pointer(&self, value: JsValue) -> Result<String, JsError> {
        let value: BaseSharedValueContainer = from_js_dif(
            value,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        )?;
        Ok(self.dif_interface.create_pointer(value).to_address_string())
    }

    /// Resolve a pointer address synchronously if it's in memory, otherwise return an error
    pub fn resolve_pointer_address(
        &self,
        address: &str,
    ) -> Result<JsValue, JsError> {
        let address = PointerAddress::try_from(address).map_err(js_error)?;
        let result = self
            .dif_interface
            .resolve_pointer_address(address)
            .map_err(js_error)?;
        Ok(to_js_dif(
            &*result.base_shared_container(),
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub fn has_address_with_ownership(
        &self,
        address: &str,
        ownership: Option<u8>,
    ) -> Result<bool, JsError> {
        let pointer_address =
            PointerAddress::try_from(address).map_err(js_error)?;
        let ownership: SharedContainerOwnership =
            SharedContainerOwnership::try_from(ownership)
                .map_err(|_| js_error("Invalid ownership value"))?;
        Ok(self
            .dif_interface
            .has_address_with_ownership(&pointer_address, ownership))
    }

    pub async fn create_inspector(
        &self,
        endpoint: &str,
        name: &str,
    ) -> Result<JsValue, JsError> {
        let endpoint = Endpoint::try_from(endpoint).map_err(js_error)?;

        let instructions = vec![
            RegularInstruction::apply(1).into(),
            RegularInstruction::text(name.to_string()).into(),
            RegularInstruction::get_entry_text("create".to_string()).into(),
            RegularInstruction::get_entry_text("inspector".to_string()).into(),
            RegularInstruction::Endpoint(Endpoint::LOCAL).into(),
        ];
        let inspector = self
            .runtime
            .execute_instructions_remote_single_receiver(endpoint, instructions, true)
            .await
            .map_err(js_error)?
            .ok_or(js_error("Failed to create inspector"))?;

        Ok(to_js_dif(
            &inspector,
            &self.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub fn remove_stored_vec(&self, address: usize) {
        self.dif_interface.cache.borrow_mut().remove_stored_vec(address);
    }
}
