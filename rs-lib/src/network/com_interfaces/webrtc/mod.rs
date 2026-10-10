use std::{cell::RefCell, ops::Deref, pin::Pin, rc::Rc, sync::Arc};

use datex_core::{
    channel::mpsc::{UnboundedReceiver, create_unbounded_channel},
    global::dxb_block::DXBBlock,
    macros::Datex,
    network::{
        com_hub::errors::ComInterfaceCreateError,
        com_interfaces::{
            com_interface::{
                factory::{
                    ComInterfaceAsyncFactory, ComInterfaceAsyncFactoryResult,
                    ComInterfaceConfiguration, SendCallback, SendFailure,
                    SocketConfiguration, SocketProperties,
                },
                properties::{ComInterfaceProperties, InterfaceDirection},
            },
            default_setup_data::webrtc::{
                RTCIceCandidateInitDX, RTCIceServerDX, RTCSdpTypeDX,
                RTCSessionDescriptionDX, WebRTCInterfaceSetupData,
                WebRTCRoleDX, WebRTCSignalDX, WebRTCSignaling,
            },
        },
    },
};
mod channels;
use channels::*;
mod mappings;
use futures::channel::oneshot;
use mappings::*;
use wasm_bindgen::{JsCast, JsValue, prelude::Closure};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    MessageEvent, RtcConfiguration, RtcDataChannel, RtcDataChannelEvent,
    RtcDataChannelInit, RtcIceCandidateInit, RtcPeerConnection,
    RtcPeerConnectionIceEvent, RtcSdpType, RtcSessionDescriptionInit, js_sys,
};
pub struct JSSignaling;
impl WebRTCSignaling for JSSignaling {
    fn receive(
        &self,
    ) -> Pin<Box<dyn Future<Output = datex_core::network::com_interfaces::default_setup_data::webrtc::WebRTCSignalResult<WebRTCSignalDX>> + Send>>
    {
        unreachable!()
    }
    fn send(
        &self,
        signal: WebRTCSignalDX,
    ) -> Pin<Box<dyn Future<Output = datex_core::network::com_interfaces::default_setup_data::webrtc::WebRTCSignalResult<()>> + Send>>{
        todo!()
    }
}

#[derive(Datex)]
#[datex(structural)]
pub struct WebRTCInterfaceSetupDataJS(WebRTCInterfaceSetupData);

impl Deref for WebRTCInterfaceSetupDataJS {
    type Target = WebRTCInterfaceSetupData;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl WebRTCInterfaceSetupDataJS {
    pub fn new(
        setup: WebRTCInterfaceSetupData,
        signaling: Rc<dyn WebRTCSignaling>,
    ) -> Self {
        Self(setup)
    }

    async fn create_interface(
        self,
    ) -> Result<ComInterfaceConfiguration, ComInterfaceCreateError> {
        todo!()
    }
}

impl ComInterfaceAsyncFactory for WebRTCInterfaceSetupDataJS {
    fn create_interface(self) -> ComInterfaceAsyncFactoryResult {
        Box::pin(self.create_interface())
    }

    fn get_default_properties() -> ComInterfaceProperties {
        WebRTCInterfaceSetupData::get_default_properties()
    }
}
