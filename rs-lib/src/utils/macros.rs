#[macro_export]
macro_rules! define_registry {
    ($name:ident, $interface_type:ident) => {
        #[derive(Clone)]
        #[wasm_bindgen]
        pub struct $name {
            runtime: datex_core::runtime::Runtime
        }

        impl $name {
            pub fn new(
                runtime: datex_core::runtime::Runtime,
            ) -> Self {
                Self { runtime }
            }
        }

        #[wasm_bindgen]
        impl $name {

            fn get_interface(
                &self,
                interface_uuid: String,
            ) -> Rc<RefCell<$interface_type>> {
                let interface_uuid =
                    ComInterfaceUUID(datex_core::utils::uuid::UUID::from_string(interface_uuid));
                let interface = self.runtime.com_hub().get_interface_by_uuid::<$interface_type>(&interface_uuid);
                let interface = interface.unwrap();
                return interface.clone();
            }
            pub fn close(&self, interface_uuid: String) -> web_sys::js_sys::Promise {
                let interface_uuid = datex_core::network::com_interfaces::com_interface::ComInterfaceUUID(
                    datex_core::utils::uuid::UUID::from_string(interface_uuid),
                );
                let runtime = self.runtime.clone();
                wasm_bindgen_futures::future_to_promise(async move {
                    let com_hub = runtime.com_hub();
                    let has_interface = {
                        com_hub.has_interface(&interface_uuid)
                    };
                    if has_interface {
                        com_hub
                            .remove_interface(interface_uuid.clone())
                            .await
                            .map_err(|e| JsError::new(&format!("{:?}", e)))?;
                        Ok(JsValue::TRUE)
                    } else {
                        error!("Failed to find interface");
                        Err(JsError::new("Failed to find interface").into())
                    }
                })
            }
        }
    };
}
