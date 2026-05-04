use std::{
    cell::{Ref, RefCell, RefMut},
    rc::Rc,
};

use crate::js_utils::{from_js_value, from_js_value_with_cache, js_error, to_js_value, to_js_value_with_cache, unwrap_or_report_js_error};
use datex_core::{
    dif::{
        cache::DIFSharedContainerCache,
        dif_interface::DIFInterface,
        pointer_address::PointerAddressWithOwnership,
    },
    shared_values::{
        PointerAddress,
        base_shared_value_container::BaseSharedValueContainer,
    },
    value_updates::update_data::Update,
    values::value_container::ValueContainer,
};
use datex_core::shared_values::base_shared_value_container::observers::{ObserveOptions, ObserverId, TransceiverId};
use js_sys::Function;
use serde::{Deserialize, de::IntoDeserializer};
use wasm_bindgen::{JsError, JsValue, prelude::wasm_bindgen};

#[wasm_bindgen]
#[derive(Clone)]
pub struct JSDIFInterface {
    #[wasm_bindgen(skip)]
    dif_interface: Rc<RefCell<DIFInterface>>,
}

impl JSDIFInterface {
    pub fn new(dif_interface: DIFInterface) -> Self {
        Self {
            dif_interface: Rc::new(RefCell::new(dif_interface)),
        }
    }
    pub fn cache(&self) -> RefMut<DIFSharedContainerCache> {
        RefMut::map(self.dif_interface.borrow_mut(), |interface| {
            &mut interface.cache
        })
    }
}

impl JSDIFInterface {
    pub fn observe_pointer(
        &self,
        transceiver_id: TransceiverId,
        address: &str,
        observe_options: JsValue,
        callback: &Function,
    ) -> Result<u32, JsError> {
        let address: PointerAddress = from_js_value(address)?;
        let cb = callback.clone();
        let observe_options: ObserveOptions = from_js_value(observe_options)?;
        let observer = move |update_data: &Update| {
            let value = to_js_value_with_cache(
                &update_data,
                &mut self.cache()
            ).expect("Failed to convert update data to JsValue");
            let _ = unwrap_or_report_js_error(cb.call1(&JsValue::NULL, &value));
        };
        self.dif_interface
            .borrow_mut()
            .observe_pointer(address, observe_options, observer)
            .map_err(js_error)
            .map(|id| id.0)
    }

    pub fn unobserve_pointer(
        &self,
        address: &str,
        observer_id: u32,
    ) -> Result<(), JsError> {
        let address: PointerAddress = from_js_value(address)?;
        self.dif_interface
            .borrow_mut()
            .unobserve_pointer(address, ObserverId(observer_id))
            .map_err(js_error)
    }

    pub fn update_observer_options(
        &self,
        address: &str,
        observer_id: u32,
        observe_options: JsValue,
    ) -> Result<(), JsError> {
        let address: PointerAddress = from_js_value(address)?;
        let observe_options: ObserveOptions = from_js_value(observe_options)?;
        self.dif_interface
            .borrow_mut()
            .update_observer_options(
                address,
                ObserverId(observer_id),
                observe_options,
            )
            .map_err(js_error)
    }

    /// Applies a DIF update on a shared container at the given address, using the provided update data.
    /// TODO: Can we optimize this, by not returning the update result data back to JS, as it adds unnecesarry overhead, as
    /// we can access the values in JS before update.
    pub fn update(
        &mut self,
        address: &str,
        update: JsValue,
    ) -> Result<JsValue, JsError> {
        let address: PointerAddress = from_js_value(address)?;
        let update: Update =
            from_js_value_with_cache(update, &mut self.cache())?;
        let result = self
            .dif_interface
            .borrow_mut()
            .update(address, update)
            .map_err(js_error)?;
        to_js_value_with_cache(&result, &mut self.cache())
    }

    pub fn apply(
        &mut self,
        callee: JsValue,
        value: JsValue,
    ) -> Result<Option<JsValue>, JsError> {
        let callee: ValueContainer =
            from_js_value_with_cache(callee, &mut self.cache())?;
        let value: ValueContainer =
            from_js_value_with_cache(value, &mut self.cache())?;
        self.dif_interface
            .borrow_mut()
            .apply(callee, value)
            .map_err(js_error)?
            .map(|res| to_js_value_with_cache(&res, &mut self.cache()))
            .transpose()
    }

    pub fn create_pointer(&self, value: JsValue) -> Result<String, JsError> {
        let value: BaseSharedValueContainer =
            from_js_value_with_cache(value, &mut self.cache())?;
        self.dif_interface
            .borrow_mut()
            .create_pointer(value)
            .map_err(js_error)
            .map(|address| address.to_string())
    }

    /// Resolve a pointer address synchronously if it's in memory, otherwise return an error
    pub fn resolve_pointer_address(
        &self,
        address: &str,
    ) -> Result<JsValue, JsError> {
        let address_with_ownership = PointerAddressWithOwnership::deserialize(
            address.into_deserializer(),
        )
        .map_err(js_error)?;
        let result = self
            .dif_interface
            .borrow_mut()
            .resolve_pointer_address(address_with_ownership)
            .map_err(js_error)?;
        to_js_value_with_cache(&result.base_shared_container(), &mut self.cache())
    }
}
