use crate::wrap_error_for_js;

wrap_error_for_js!(
    JsComInterfaceError,
    datex_core::network::com_interfaces::com_interface::error::ComInterfaceError
);

wrap_error_for_js!(
    JsComInterfaceCreateError,
    datex_core::network::com_hub::errors::ComInterfaceCreateError
);
