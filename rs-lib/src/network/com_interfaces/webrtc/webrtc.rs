use std::{
    cell::RefCell, future::Future, pin::Pin, rc::Rc, sync::Mutex,
    time::Duration,
}; // FIXME no-std

use async_trait::async_trait;
use datex_core::{
    delegate_com_interface_info,
    network::com_interfaces::{
        com_interface::{
            ComInterface, ComInterfaceError, ComInterfaceFactory,
            ComInterfaceInfo, ComInterfaceSockets,
        },
        com_interface_properties::InterfaceProperties,
        com_interface_socket::ComInterfaceSocketUUID,
        default_com_interfaces::webrtc::webrtc_common::{
            data_channels::{DataChannel, DataChannels},
            media_tracks::{MediaKind, MediaTrack, MediaTracks},
            structures::{
                RTCIceCandidateInitDX, RTCIceServer, RTCSdpTypeDX,
                RTCSessionDescriptionDX,
            },
            utils::WebRTCError,
            webrtc_commons::{WebRTCCommon, WebRTCInterfaceSetupData},
            webrtc_trait::{WebRTCTrait, WebRTCTraitInternal},
        },
        socket_provider::SingleSocketProvider,
    },
    set_opener,
    stdlib::sync::Arc,
    task::spawn_local,
    values::core_values::endpoint::Endpoint,
};

use datex_core::network::com_interfaces::com_interface::ComInterfaceState;
use js_sys::{Array, Function, Reflect};
use wasm_bindgen_futures::JsFuture;

use crate::{
    js_utils::TryAsByteSlice, network::com_hub::JSComHub, wrap_error_for_js,
};
use datex_core::network::com_hub::ComHubError;
use datex_macros::{com_interface, create_opener};
use log::{error, info};
use wasm_bindgen::{
    JsCast, JsValue,
    prelude::{Closure, wasm_bindgen},
};
use web_sys::{
    MediaStream, MessageEvent, RtcConfiguration, RtcDataChannel,
    RtcDataChannelEvent, RtcIceCandidateInit, RtcIceServer, RtcPeerConnection,
    RtcPeerConnectionIceEvent, RtcSdpType, RtcSessionDescriptionInit,
    RtcSignalingState,
};

wrap_error_for_js!(JSWebRTCError, datex_core::network::com_interfaces::default_com_interfaces::webrtc::webrtc_common::utils::WebRTCError);

impl From<ComHubError> for JSWebRTCError {
    fn from(err: ComHubError) -> Self {
        WebRTCError::ComHubError(err).into()
    }
}

pub struct WebRTCJSInterface {
    info: ComInterfaceInfo,
    commons: Arc<Mutex<WebRTCCommon>>,
    peer_connection: Rc<Option<RtcPeerConnection>>,
    data_channels: Rc<RefCell<DataChannels<RtcDataChannel>>>,
    local_media_tracks: Rc<RefCell<MediaTracks<MediaStream>>>,
    remote_media_tracks: Rc<RefCell<MediaTracks<MediaStream>>>,
}
impl SingleSocketProvider for WebRTCJSInterface {
    fn provide_sockets(&self) -> Arc<Mutex<ComInterfaceSockets>> {
        self.get_sockets()
    }
}
impl WebRTCTrait<RtcDataChannel, MediaStream, MediaStream>
    for WebRTCJSInterface
{
    fn new(peer_endpoint: impl Into<Endpoint>) -> Self {
        WebRTCJSInterface {
            info: ComInterfaceInfo::default(),
            commons: Arc::new(Mutex::new(WebRTCCommon::new(peer_endpoint))),
            peer_connection: Rc::new(None),
            data_channels: Rc::new(RefCell::new(DataChannels::default())),
            local_media_tracks: Rc::new(RefCell::new(MediaTracks::default())),
            remote_media_tracks: Rc::new(RefCell::new(MediaTracks::default())),
        }
    }
    fn new_with_ice_servers(
        peer_endpoint: impl Into<Endpoint>,
        ice_servers: Vec<RTCIceServer>,
    ) -> Self {
        let interface = Self::new(peer_endpoint);
        interface.set_ice_servers(ice_servers);
        interface
    }
}

#[async_trait(?Send)]
impl WebRTCTraitInternal<RtcDataChannel, MediaStream, MediaStream>
    for WebRTCJSInterface
{
    fn provide_remote_media_tracks(
        &self,
    ) -> Rc<RefCell<MediaTracks<MediaStream>>> {
        self.remote_media_tracks.clone()
    }
    fn provide_local_media_tracks(
        &self,
    ) -> Rc<RefCell<MediaTracks<MediaStream>>> {
        self.local_media_tracks.clone()
    }

    async fn handle_create_media_channel(
        &self,
        id: String,
        kind: MediaKind,
    ) -> Result<MediaTrack<MediaStream>, WebRTCError> {
        todo!("Implement media channel creation")
    }

    async fn handle_setup_media_channel(
        channel: Rc<RefCell<MediaTrack<MediaStream>>>,
    ) -> Result<(), WebRTCError> {
        todo!("Implement media channel setup")
    }

    fn provide_data_channels(
        &self,
    ) -> Rc<RefCell<DataChannels<RtcDataChannel>>> {
        self.data_channels.clone()
    }
    fn provide_info(&self) -> &ComInterfaceInfo {
        &self.info
    }
    async fn handle_create_data_channel(
        &self,
    ) -> Result<DataChannel<RtcDataChannel>, WebRTCError> {
        if let Some(peer_connection) = self.peer_connection.as_ref() {
            let data_channel = peer_connection.create_data_channel("DATEX");
            Ok(DataChannel::new(data_channel.label(), data_channel))
        } else {
            error!("Peer connection is not initialized");
            Err(WebRTCError::ConnectionError)
        }
    }

    async fn handle_setup_data_channel(
        channel: Rc<RefCell<DataChannel<RtcDataChannel>>>,
    ) -> Result<(), WebRTCError> {
        let channel_clone = channel.clone();
        {
            let onopen_callback = Closure::<dyn FnMut()>::new(move || {
                let open_channel = {
                    let channel_clone = channel_clone.clone();
                    let channel_clone = channel_clone.borrow_mut();
                    if let Some(open_channel) =
                        channel_clone.open_channel.take()
                    {
                        open_channel
                    } else {
                        return;
                    }
                };
                info!("Data channel opened");
                open_channel();
            });
            channel
                .clone()
                .borrow()
                .data_channel
                .set_onopen(Some(onopen_callback.as_ref().unchecked_ref()));
            onopen_callback.forget();
        }
        let channel_clone = channel.clone();
        {
            let onmessage_callback = Closure::<dyn FnMut(MessageEvent)>::new(
                move |message_event: MessageEvent| {
                    let channel_clone = channel_clone.clone();
                    let data = message_event.data().try_as_u8_slice();
                    if let Ok(data) = data
                        && let Some(on_message) = channel_clone
                            .clone()
                            .borrow()
                            .on_message
                            .borrow()
                            .as_ref()
                    {
                        on_message(data);
                    } else {
                        error!("Failed to convert message data");
                    }
                },
            );
            channel.clone().borrow().data_channel.set_onmessage(Some(
                onmessage_callback.as_ref().unchecked_ref(),
            ));
            onmessage_callback.forget();
        }
        Ok(())
    }

    async fn handle_create_offer(
        &self,
    ) -> Result<RTCSessionDescriptionDX, WebRTCError> {
        if let Some(peer_connection) = self.peer_connection.as_ref() {
            let offer = JsFuture::from(peer_connection.create_offer())
                .await
                .unwrap();
            let sdp: String = Reflect::get(&offer, &JsValue::from_str("sdp"))
                .unwrap()
                .as_string()
                .unwrap();
            info!("Offer created {sdp}");
            Ok(RTCSessionDescriptionDX {
                sdp_type: RTCSdpTypeDX::Offer,
                sdp,
            })
        } else {
            error!("Peer connection is not initialized");
            Err(WebRTCError::ConnectionError)
        }
    }

    async fn handle_add_ice_candidate(
        &self,
        candidate_init: RTCIceCandidateInitDX,
    ) -> Result<(), WebRTCError> {
        if let Some(peer_connection) = self.peer_connection.as_ref() {
            let signaling_state = peer_connection.signaling_state();

            // Ensure remote description is set
            if signaling_state != RtcSignalingState::Stable
                && signaling_state != RtcSignalingState::HaveLocalOffer
                && signaling_state != RtcSignalingState::HaveRemoteOffer
            {
                return Err(WebRTCError::MissingRemoteDescription);
            }
            let js_candidate_init =
                RtcIceCandidateInit::new(&candidate_init.candidate);
            js_candidate_init.set_sdp_mid(candidate_init.sdp_mid.as_deref());
            js_candidate_init
                .set_sdp_m_line_index(candidate_init.sdp_mline_index);
            info!(
                "Adding ICE candidate for {}: {:?}",
                self.remote_endpoint(),
                js_candidate_init
            );
            JsFuture::from(
                peer_connection
                    .add_ice_candidate_with_opt_rtc_ice_candidate_init(Some(
                        &js_candidate_init,
                    )),
            )
            .await
            .map_err(|e| {
                error!("Failed to add ICE candidate {e:?}");
                WebRTCError::InvalidCandidate
            })?;
            info!("ICE candidate added {}", self.remote_endpoint());
            Ok(())
        } else {
            error!("Peer connection is not initialized");
            Err(WebRTCError::ConnectionError)
        }
    }

    async fn handle_set_local_description(
        &self,
        description: RTCSessionDescriptionDX,
    ) -> Result<(), WebRTCError> {
        if let Some(peer_connection) = self.peer_connection.as_ref() {
            let description_init =
                RtcSessionDescriptionInit::new(match description.sdp_type {
                    RTCSdpTypeDX::Offer => RtcSdpType::Offer,
                    RTCSdpTypeDX::Answer => RtcSdpType::Answer,
                    _ => Err(WebRTCError::InvalidSdp)?,
                });
            description_init.set_sdp(&description.sdp);
            JsFuture::from(
                peer_connection.set_local_description(&description_init),
            )
            .await
            .unwrap();
            Ok(())
        } else {
            error!("Peer connection is not initialized");
            return Err(WebRTCError::ConnectionError);
        }
    }

    async fn handle_set_remote_description(
        &self,
        description: RTCSessionDescriptionDX,
    ) -> Result<(), WebRTCError> {
        if let Some(peer_connection) = self.peer_connection.as_ref() {
            let description_init =
                RtcSessionDescriptionInit::new(match description.sdp_type {
                    RTCSdpTypeDX::Offer => RtcSdpType::Offer,
                    RTCSdpTypeDX::Answer => RtcSdpType::Answer,
                    _ => Err(WebRTCError::InvalidSdp)?,
                });
            description_init.set_sdp(&description.sdp);
            JsFuture::from(
                peer_connection.set_remote_description(&description_init),
            )
            .await
            .unwrap();
            Ok(())
        } else {
            error!("Peer connection is not initialized");
            return Err(WebRTCError::ConnectionError);
        }
    }

    async fn handle_create_answer(
        &self,
    ) -> Result<RTCSessionDescriptionDX, WebRTCError> {
        if let Some(peer_connection) = self.peer_connection.as_ref() {
            let answer = JsFuture::from(peer_connection.create_answer())
                .await
                .unwrap();
            let sdp = Reflect::get(&answer, &JsValue::from_str("sdp"))
                .unwrap()
                .as_string()
                .unwrap();
            Ok(RTCSessionDescriptionDX {
                sdp_type: RTCSdpTypeDX::Answer,
                sdp,
            })
        } else {
            error!("Peer connection is not initialized");
            Err(WebRTCError::ConnectionError)
        }
    }

    fn get_commons(&self) -> Arc<Mutex<WebRTCCommon>> {
        self.commons.clone()
    }
}

#[com_interface]
impl WebRTCJSInterface {
    #[create_opener]
    async fn open(&mut self) -> Result<(), WebRTCError> {
        let config = RtcConfiguration::new();

        {
            // ICE servers
            let ice_servers =
                self.get_commons().lock().unwrap().ice_servers.clone();
            let js_ice_servers = js_sys::Array::new();
            for server in ice_servers {
                let js_server = RtcIceServer::new();
                let urls_array = Array::new();
                for url in &server.urls {
                    urls_array.push(&JsValue::from_str(url));
                }
                js_server.set_urls(&urls_array);

                if let Some(username) = server.username {
                    js_server.set_username(&username);
                }
                if let Some(credential) = server.credential {
                    js_server.set_credential(&credential);
                }
                js_ice_servers.push(&js_server);
            }
            config.set_ice_servers(&js_ice_servers);
        }

        let connection = RtcPeerConnection::new_with_configuration(&config)
            .map_err(|_| WebRTCError::Unsupported)?;
        let remote_endpoint = self.remote_endpoint().clone().to_string();

        let commons = self.get_commons();
        let onicecandidate_callback = Closure::<dyn FnMut(_)>::new(
            move |ev: RtcPeerConnectionIceEvent| {
                if let Some(candidate) = ev.candidate() {
                    commons.clone().lock().unwrap().on_ice_candidate(
                        RTCIceCandidateInitDX {
                            candidate: candidate.candidate(),
                            sdp_mid: candidate.sdp_mid(),
                            sdp_mline_index: candidate.sdp_m_line_index(),
                            username_fragment: None,
                        },
                    );
                }
            },
        );
        connection.set_onicecandidate(Some(
            onicecandidate_callback.as_ref().unchecked_ref(),
        ));
        onicecandidate_callback.forget();

        let connection = Rc::new(Some(connection));
        self.peer_connection = connection.clone();

        let data_channels = self.data_channels.clone();
        let ondatachannel_callback =
            Closure::<dyn FnMut(_)>::new(move |ev: RtcDataChannelEvent| {
                let data_channels = data_channels.clone();
                spawn_local(async move {
                    data_channels
                        .clone()
                        .borrow_mut()
                        .create_data_channel(
                            ev.channel().label().to_string(),
                            ev.channel().clone(),
                        )
                        .await;
                });
            });

        let connection_clone = connection.clone();
        let oniceconnectionstatechange_callback = Closure::<dyn FnMut()>::new(
            move || {
                if let Some(connection) = connection_clone.as_ref() {
                    let state = connection.ice_connection_state();
                    info!(
                        "ICE connection state of remote {remote_endpoint}: {state:?}"
                    );
                }
            },
        );
        if let Some(connection) = connection.as_ref() {
            connection.set_oniceconnectionstatechange(Some(
                oniceconnectionstatechange_callback.as_ref().unchecked_ref(),
            ));
            oniceconnectionstatechange_callback.forget();

            connection.set_ondatachannel(Some(
                ondatachannel_callback.as_ref().unchecked_ref(),
            ));
            ondatachannel_callback.forget();
        }
        self.setup_listeners();
        Ok(())
    }
}

impl ComInterface for WebRTCJSInterface {
    fn send_block<'a>(
        &'a mut self,
        block: &'a [u8],
        _: ComInterfaceSocketUUID,
    ) -> Pin<Box<dyn Future<Output = bool> + 'a>> {
        let success = {
            if let Some(channel) = self
                .data_channels
                .clone()
                .borrow()
                .get_data_channel("DATEX")
            {
                channel
                    .clone()
                    .borrow()
                    .data_channel
                    .send_with_u8_array(block)
                    .is_ok()
            } else {
                error!("Failed to send message, data channel not found");
                false
            }
        };
        Box::pin(async move { success })
    }

    fn init_properties(&self) -> InterfaceProperties {
        InterfaceProperties {
            interface_type: "webrtc".to_string(),
            channel: "webrtc".to_string(),
            round_trip_time: Duration::from_millis(40),
            max_bandwidth: 1000,
            ..InterfaceProperties::default()
        }
    }
    fn handle_close<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = bool> + 'a>> {
        let success = {
            if let Some(peer_connection) = self.peer_connection.as_ref() {
                peer_connection.close();
                self.peer_connection = Rc::new(None);

                let mut commons = self.commons.lock().unwrap();
                commons.reset();

                let data_channels = self.data_channels.clone();
                data_channels.borrow_mut().reset();
                true
            } else {
                false
            }
        };
        Box::pin(async move { success })
    }
    delegate_com_interface_info!();
    set_opener!(open);
}

impl ComInterfaceFactory<WebRTCInterfaceSetupData> for WebRTCJSInterface {
    fn create(
        setup_data: WebRTCInterfaceSetupData,
    ) -> Result<WebRTCJSInterface, ComInterfaceError> {
        if let Some(ice_servers) = setup_data.ice_servers.as_ref() {
            if ice_servers.is_empty() {
                error!(
                    "Ice servers list is empty, at least one ice server is required"
                );
                Err(ComInterfaceError::InvalidSetupData)
            } else {
                Ok(WebRTCJSInterface::new_with_ice_servers(
                    setup_data.peer_endpoint,
                    ice_servers.to_owned(),
                ))
            }
        } else {
            Ok(WebRTCJSInterface::new(setup_data.peer_endpoint))
        }
    }

    fn get_default_properties() -> InterfaceProperties {
        InterfaceProperties::default()
    }
}

#[wasm_bindgen]
impl JSComHub {
    pub async fn webrtc_interface_create_offer(
        &self,
        interface_uuid: String,
    ) -> Result<Vec<u8>, JSWebRTCError> {
        let interface =
            self.get_interface_for_uuid::<WebRTCJSInterface>(interface_uuid)?;
        let webrtc_interface = interface.borrow();
        let offer = webrtc_interface.create_offer().await?;
        Ok(offer)
    }

    pub async fn webrtc_interface_create_answer(
        &self,
        interface_uuid: String,
        offer: Vec<u8>,
    ) -> Result<Vec<u8>, JSWebRTCError> {
        let interface =
            self.get_interface_for_uuid::<WebRTCJSInterface>(interface_uuid)?;
        let webrtc_interface = interface.borrow();
        let answer = webrtc_interface.create_answer(offer).await?;
        Ok(answer)
    }

    pub async fn webrtc_interface_set_answer(
        &self,
        interface_uuid: String,
        answer: Vec<u8>,
    ) -> Result<(), JSWebRTCError> {
        let interface =
            self.get_interface_for_uuid::<WebRTCJSInterface>(interface_uuid)?;
        let webrtc_interface = interface.borrow();
        webrtc_interface.set_answer(answer).await?;
        Ok(())
    }
    pub fn webrtc_interface_set_on_ice_candidate(
        &self,
        interface_uuid: String,
        on_ice_candidate: Function,
    ) -> Result<(), JSWebRTCError> {
        let interface =
            self.get_interface_for_uuid::<WebRTCJSInterface>(interface_uuid)?;
        let webrtc_interface = interface.borrow();
        webrtc_interface.set_on_ice_candidate(Box::new(move |candidate| {
            on_ice_candidate
                .call1(&JsValue::NULL, &JsValue::from(candidate))
                .unwrap();
        }));
        Ok(())
    }

    pub async fn webrtc_interface_add_ice_candidate(
        &self,
        interface_uuid: String,
        candidate: Vec<u8>,
    ) -> Result<(), JSWebRTCError> {
        let interface =
            self.get_interface_for_uuid::<WebRTCJSInterface>(interface_uuid)?;
        let webrtc_interface = interface.borrow();
        webrtc_interface.add_ice_candidate(candidate).await?;
        Ok(())
    }

    pub async fn webrtc_interface_wait_for_connection(
        &self,
        interface_uuid: String,
    ) -> Result<(), JSWebRTCError> {
        let interface =
            self.get_interface_for_uuid::<WebRTCJSInterface>(interface_uuid)?;
        let webrtc_interface = interface.borrow();
        webrtc_interface.wait_for_connection().await?;
        Ok(())
    }
}
