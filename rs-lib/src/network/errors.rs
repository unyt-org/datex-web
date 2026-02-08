use crate::wrap_error_for_js;

wrap_error_for_js!(
    JsComInterfaceError,
    datex::network::com_interfaces::com_interface::error::ComInterfaceError
);

wrap_error_for_js!(
    JsComInterfaceCreateError,
    datex::network::com_hub::errors::ComInterfaceCreateError
);
