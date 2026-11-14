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
use datex_core::network::com_interfaces::com_interface::factory::SendSuccess;
use futures::{FutureExt, pin_mut};
use futures_channel::oneshot;
use wasm_bindgen::{JsCast, JsError, JsValue, prelude::Closure};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    MessageEvent, RtcDataChannel, RtcDataChannelEvent, RtcPeerConnection,
    RtcPeerConnectionIceEvent, RtcSessionDescriptionInit,
};

use crate::{js_utils::js_error, network::com_interfaces::webrtc::mappings::*};

pub async fn create_webrtc_interface_js(
    setup: WebRTCInterfaceSetupData,
    signaling: Rc<dyn WebRTCSignaling>,
) -> Result<ComInterfaceConfiguration, JsValue> {
    let config = make_rtc_configuration(&setup.ice_servers)?;

    let peer_connection = Rc::new(
        RtcPeerConnection::new_with_configuration(&config)
            .expect("Failed to create RtcPeerConnection"),
    );

    install_ice_callback(peer_connection.clone(), signaling.clone());

    let (mut incoming_tx, incoming_rx) = create_unbounded_channel::<Vec<u8>>();

    let data_channel = match setup.role {
        WebRTCRoleDX::Offerer => {
            create_offerer_channel_js(
                &setup,
                peer_connection.clone(),
                signaling.clone(),
                incoming_tx,
            )
            .await?
        }

        WebRTCRoleDX::Answerer => {
            create_answerer_channel_js(
                peer_connection.clone(),
                signaling.clone(),
                incoming_tx,
            )
            .await?
        }
    };

    Ok(make_com_interface_js(
        setup,
        peer_connection,
        data_channel,
        incoming_rx,
    ))
}

fn install_ice_callback(
    peer_connection: Rc<RtcPeerConnection>,
    signaling: Rc<dyn WebRTCSignaling>,
) {
    let onicecandidate =
        Closure::wrap(Box::new(move |event: RtcPeerConnectionIceEvent| {
            let Some(signal) = make_dx_ice_candidate(event) else {
                return;
            };
            let signaling = signaling.clone();
            wasm_bindgen_futures::spawn_local(async move {
                if let Err(error) = signaling.send(signal).await {
                    log::warn!("Failed to send WebRTC ICE signal: {error}");
                }
            });
        }) as Box<dyn FnMut(_)>);

    peer_connection
        .set_onicecandidate(Some(onicecandidate.as_ref().unchecked_ref()));
    onicecandidate.forget();
}

async fn create_offerer_channel_js(
    setup: &WebRTCInterfaceSetupData,
    peer_connection: Rc<RtcPeerConnection>,
    signaling: Rc<dyn WebRTCSignaling>,
    incoming_tx: datex_core::channel::mpsc::UnboundedSender<Vec<u8>>,
) -> Result<RtcDataChannel, String> {
    let data_channel_init = make_data_channel_init(setup)?;
    let data_channel = peer_connection
        .create_data_channel_with_data_channel_dict(
            &setup.data_channel_label,
            &data_channel_init,
        );
    let open_rx =
        install_data_channel_callbacks(data_channel.clone(), incoming_tx);
    let offer_value = JsFuture::from(peer_connection.create_offer())
        .await
        .expect("Failed to create WebRTC offer");

    let offer = offer_value
        .clone()
        .unchecked_into::<RtcSessionDescriptionInit>();
    JsFuture::from(peer_connection.set_local_description(&offer))
        .await
        .expect("Failed to set local description on WebRTC peer connection");
    signaling
        .send(WebRTCSignalDX::Description(make_dx_sdp_description(
            offer_value,
        )?))
        .await?;
    let mut got_answer = false;
    let mut channel_open = false;

    let open_rx = open_rx.fuse();
    pin_mut!(open_rx);

    while !(got_answer && channel_open) {
        futures::select! {
            open_result = open_rx => {
                open_result
                    .map_err(|_| "WebRTC data channel closed before open".to_string())?;
                channel_open = true;
            }

            signal = signaling.receive().fuse() => {
                match signal? {
                    WebRTCSignalDX::Description(description) => {
                        if description.sdp_type != RTCSdpTypeDX::Answer {
                            return Err("expected WebRTC answer".to_string());
                        }
                        let description = make_js_sdp_description(description)?;
                        JsFuture::from(peer_connection.set_remote_description(&description))
                            .await
                            .expect("Failed to set remote description on WebRTC peer connection");
                        got_answer = true;
                    }

                    WebRTCSignalDX::IceCandidate(candidate) => {
                        let candidate = make_js_ice_candidate(candidate);
                        JsFuture::from(
                            peer_connection
                                .add_ice_candidate_with_opt_rtc_ice_candidate_init(Some(&candidate))
                        )
                        .await
                        .expect("Failed to add ICE candidate to WebRTC peer connection");
                    }

                    WebRTCSignalDX::EndOfCandidates => {
                        let _ = JsFuture::from(
                            peer_connection
                                .add_ice_candidate_with_opt_rtc_ice_candidate_init(None)
                        )
                        .await;
                    }
                }
            }
        }
    }

    Ok(data_channel)
}

async fn create_answerer_channel_js(
    peer_connection: Rc<RtcPeerConnection>,
    signaling: Rc<dyn WebRTCSignaling>,
    incoming_tx: datex_core::channel::mpsc::UnboundedSender<Vec<u8>>,
) -> Result<RtcDataChannel, String> {
    let (dc_tx, dc_rx) = oneshot::channel::<RtcDataChannel>();
    let dc_tx = Rc::new(RefCell::new(Some(dc_tx)));

    let ondatachannel =
        Closure::wrap(Box::new(move |event: RtcDataChannelEvent| {
            if let Some(tx) = dc_tx.borrow_mut().take() {
                let _ = tx.send(event.channel());
            }
        }) as Box<dyn FnMut(_)>);

    peer_connection
        .set_ondatachannel(Some(ondatachannel.as_ref().unchecked_ref()));

    ondatachannel.forget();

    loop {
        match signaling.receive().await? {
            WebRTCSignalDX::Description(description) => {
                if description.sdp_type != RTCSdpTypeDX::Offer {
                    return Err("expected WebRTC offer".to_string());
                }

                let remote_description = make_js_sdp_description(description)?;

                JsFuture::from(
                    peer_connection.set_remote_description(&remote_description),
                )
                .await
                .expect("Failed to set remote description on WebRTC peer connection");

                let answer_value =
                    JsFuture::from(peer_connection.create_answer())
                        .await
                        .expect("Failed to create WebRTC answer");

                let answer = answer_value
                    .clone()
                    .unchecked_into::<RtcSessionDescriptionInit>();

                JsFuture::from(peer_connection.set_local_description(&answer))
                    .await
                    .expect("Failed to set local description on WebRTC peer connection");

                signaling
                    .send(WebRTCSignalDX::Description(make_dx_sdp_description(
                        answer_value,
                    )?))
                    .await?;

                break;
            }

            WebRTCSignalDX::IceCandidate(candidate) => {
                let candidate = make_js_ice_candidate(candidate);

                JsFuture::from(
                    peer_connection
                        .add_ice_candidate_with_opt_rtc_ice_candidate_init(
                            Some(&candidate),
                        ),
                )
                .await
                .expect(
                    "Failed to add ICE candidate to WebRTC peer connection",
                );
            }

            WebRTCSignalDX::EndOfCandidates => {
                let _ = JsFuture::from(
                    peer_connection
                        .add_ice_candidate_with_opt_rtc_ice_candidate_init(
                            None,
                        ),
                )
                .await;
            }
        }
    }

    let data_channel = dc_rx.await.map_err(|_| {
        "remote peer did not create WebRTC data channel".to_string()
    })?;

    let open_rx =
        install_data_channel_callbacks(data_channel.clone(), incoming_tx);

    open_rx
        .await
        .map_err(|_| "WebRTC data channel closed before open".to_string())?;

    Ok(data_channel)
}

fn install_data_channel_callbacks(
    data_channel: RtcDataChannel,
    mut incoming_tx: datex_core::channel::mpsc::UnboundedSender<Vec<u8>>,
) -> oneshot::Receiver<()> {
    let (open_tx, open_rx) = oneshot::channel::<()>();
    let open_tx = Rc::new(RefCell::new(Some(open_tx)));

    let onopen = {
        let open_tx = open_tx.clone();

        Closure::once(move |_event: web_sys::Event| {
            if let Some(tx) = open_tx.borrow_mut().take() {
                let _ = tx.send(());
            }
        })
    };

    data_channel.set_onopen(Some(onopen.as_ref().unchecked_ref()));
    onopen.forget();

    let onmessage = Closure::wrap(Box::new(move |event: MessageEvent| {
        if let Ok(buffer) = event.data().dyn_into::<js_sys::ArrayBuffer>() {
            let array = js_sys::Uint8Array::new(&buffer);
            let mut data = vec![0; array.byte_length() as usize];
            array.copy_to(&mut data[..]);

            let _ = incoming_tx.start_send(data);
        } else {
            log::warn!("Ignoring non-ArrayBuffer WebRTC DataChannel message");
        }
    }) as Box<dyn FnMut(_)>);

    data_channel.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
    onmessage.forget();

    let onerror = Closure::wrap(Box::new(move |_event: web_sys::Event| {
        log::warn!("WebRTC DataChannel error");
    }) as Box<dyn FnMut(_)>);

    data_channel.set_onerror(Some(onerror.as_ref().unchecked_ref()));
    onerror.forget();

    open_rx
}

pub fn make_com_interface_js(
    setup: WebRTCInterfaceSetupData,
    peer_connection: Rc<RtcPeerConnection>,
    data_channel: RtcDataChannel,
    mut incoming_rx: UnboundedReceiver<Vec<u8>>,
) -> ComInterfaceConfiguration {
    let data_channel = Rc::new(data_channel);

    ComInterfaceConfiguration::new_single_socket(
        ComInterfaceProperties {
            name: Some(setup.data_channel_label),
            ..WebRTCInterfaceSetupData::get_default_properties()
        },
        SocketConfiguration::new_in_out(
            SocketProperties::new(InterfaceDirection::InOut, 1),
            async gen move {
                let _keep_peer_connection_alive = peer_connection;

                loop {
                    while let Some(data) = incoming_rx.next().await {
                        yield Ok(data);
                    }
                }
            },
            SendCallback::new_async(move |block: DXBBlock| {
                let data_channel = data_channel.clone();

                async move {
                    data_channel
                        .send_with_u8_array(&block.to_bytes())
                        .map_err(|_| SendFailure(Box::new(block)))?;

                    Ok(SendSuccess::Sent)
                }
            }),
        ),
    )
}
