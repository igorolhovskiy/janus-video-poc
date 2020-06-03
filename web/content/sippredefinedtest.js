// We make use of this 'server' variable to provide the address of the
// REST Janus API. By default, in this example we assume that Janus is
// co-located with the web server hosting the HTML pages but listening
// on a different port (8088, the default for HTTP in Janus), which is
// why we make use of the 'window.location.hostname' base address. Since
// Janus can also do HTTPS, and considering we don't really want to make
// use of HTTP for Janus if your demos are served on HTTPS, we also rely
// on the 'window.location.protocol' prefix to build the variable, in
// particular to also change the port used to contact Janus (8088 for
// HTTP and 8089 for HTTPS, if enabled).
// In case you place Janus behind an Apache frontend (as we did on the
// online demos at http://janus.conf.meetecho.com) you can just use a
// relative path for the variable, e.g.:
//
// 		let server = "/janus";
//
// which will take care of this on its own.
//
//
// If you want to use the WebSockets frontend to Janus, instead, you'll
// have to pass a different kind of address, e.g.:
//
// 		let server = "ws://" + window.location.hostname + ":8188";
//
// Of course this assumes that support for WebSockets has been built in
// when compiling the server. WebSockets support has not been tested
// as much as the REST API, so handle with care!
//
//
// If you have multiple options available, and want to let the library
// autodetect the best way to contact your server (or pool of servers),
// you can also pass an array of servers, e.g., to provide alternative
// means of access (e.g., try WebSockets first and, if that fails, fall
// back to plain HTTP) or just have failover servers:
//
//		let server = [
//			"ws://" + window.location.hostname + ":8188",
//			"/janus"
//		];
//
// This will tell the library to try connecting to each of the servers
// in the presented order. The first working server will be used for
// the whole session.
//

let sip_proxy = "127.0.0.1";
let sip_proxy_port = "5061";

let server = null;
if(window.location.protocol === 'http:') {
	server = "http://" + window.location.hostname + ":8088/janus";
} else {
	server = "https://" + window.location.hostname + ":8089/janus";
}

let janus = null;
let sipcall = null;
let videocall = null;

let sipOpaqueId = "siptest-" + Janus.randomString(12);
let echoOpaqueId = "siptest-" + Janus.randomString(12);

let spinner = null;

let selectedApproach = null;
let registered = false;
let masterId = null, helpers = {}, helpersCount = 0;

let incoming = null;


$(document).ready(function() {

	$('#start_1').click(function() {
		JanusProcess('700000100001', (err, res) => {
			if (err) {
				console.log("[SipPreDefined] Error: " + err);
				return;
			}
			console.log("[SipPreDefined] " + res);
		});
	});

	$('#start_2').click(function() {
		JanusProcess('700000100002', (err, res) => {
			if (err) {
				bootbox.alert(err);
				return;
			}
			console.log("[SipPreDefined] " + res);
		});
	});

	$('#start_3').click(function() {
		JanusProcess('700000100003', (err, res) => {
			if (err) {
				bootbox.alert(err);
				return;
			}
			console.log("[SipPreDefined] " + res);
		});
	});


	// Initialize the library (all console debuggers enabled)
	
});


function JanusProcess(account, callback) {

	// Destroy all previous versions of Janus 
	if (janus !== null && typeof(janus.destroy) === 'function') {
		janus.destroy();
	}
	
	Janus.init({debug: "all", callback: function() {

		// Make sure the browser supports WebRTC
		if(!Janus.isWebrtcSupported()) {
			callback("[JanusProcess] No WebRTC support... ", null);
			return;
		}
		// Create session
		janus = new Janus({
				server: server,
				success: function() {
					// Attach to SIP plugin
					janus.attach({
						plugin: "janus.plugin.sip",
						opaqueId: sipOpaqueId,
						success: function(pluginHandle) {
							sipcall = pluginHandle;
							Janus.log("[SipPreDefined] Plugin attached! (" + sipcall.getPlugin() + ", id=" + sipcall.getId() + ")");
							
							// Prepare the username registration
							registerUsername(account);
							callback(null, "[SipPreDefined] RegisterUsername started...");
						},
						error: function(error) {
							callback("[SipPreDefined]  -- Error attaching plugin..." + error, null);
							return;
						},
						iceState: function(state) {
							Janus.log("[SipPreDefined] ICE state changed to " + state);
						},
						mediaState: function(medium, on) {
							Janus.log("[SipPreDefined] Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
						},
						webrtcState: function(on) {
							Janus.log("[SipPreDefined] Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
							$("#videoleft").parent().unblock();
						},
						onmessage: function(msg, jsep) {
							Janus.debug("[SipPreDefined] ::: Got a message :::", msg);
							// Any error?
							if(msg["error"]) {
								callback("[SipPreDefined] Message error: " + msg["error"], null);
							}
							let callId = msg["call_id"];
							let result = msg["result"];
							if(result && result["event"]) {
								let event = result["event"];
								// Event Switch

								if (event === 'registration_failed') {
									callback("[SipPreDefined] Registration failed: " + result["code"] + " " + result["reason"], null);
									return;
								} else if (event === 'registered') {
									Janus.log("[SipPreDefined] Successfully registered as " + result["username"] + ", calling...");

									// Time to make a call to ConfBridge!
									doSipAudioCall("5555"); 

								} else if(event === 'calling') {
									Janus.log("[SipPreDefined] Waiting for the peer to answer...");
									// Show "Hangup" button
									$('#hangup').removeAttr('disabled').removeClass('hidden').click(doHangup);
									// TODO Any ringtone?
								} else if (event === 'incomingcall') {
									Janus.log("Incoming call from " + result["username"] + ", ignoring....");										
								} else if(event === 'accepting') {
									// Response to an offerless INVITE, var's wait for an 'accepted'
									Janus.log("accepting from " + JSON.stringify(result) + ", continue....");
								} else if(event === 'progress') {
									Janus.log("[SipPreDefined] There's early media from " + result["username"] + ", wairing for the call!", jsep);
									// Call can start already: handle the remote answer
									if(jsep) {
										sipcall.handleRemoteJsep({ jsep: jsep, error: doHangup });
									}
									toastr.info("Early media...");
								} else if(event === 'accepted') {
									Janus.log("[SipPreDefined] " + result["username"] + " accepted the call!", jsep);
									// Call can start, now: handle the remote answer
									if(jsep) {
										sipcall.handleRemoteJsep({ jsep: jsep, error: doHangup });
									}
									sipcall.callId = callId;

								} else if (event === 'updatingcall') {
									// We got a re-INVITE: while we may prompt the user (e.g.,
									// to notify about media changes), to keep things simple
									// we just accept the update and send an answer right away
									Janus.log("[SipPreDefined] Got re-INVITE");
									let doAudio = (jsep.sdp.indexOf("m=audio ") > -1),
										doVideo = (jsep.sdp.indexOf("m=video ") > -1);
									sipcall.createAnswer(
										{
											jsep: jsep,
											media: { audio: doAudio, video: doVideo },
											success: function(jsep) {
												Janus.debug("[SipPreDefined] Got SDP " + jsep.type + "! audio=" + doAudio + ", video=" + doVideo + ":", jsep);
												let body = { request: "update" };
												sipcall.send({ message: body, jsep: jsep });
											},
											error: function(error) {
												Janus.log("[SipPreDefined] WebRTC error... " + error.message, null);
											}
										});
								} else if (event === 'message') {
									// We got a MESSAGE
									Janus.log('[SipPreDefined] Got message ' + JSON.stringify(result));
								} else if(event === 'info') {
									// We got an INFO
									Janus.log('[SipPreDefined] Got info ' + JSON.stringify(result));
								} else if(event === 'notify') {
									Janus.log('[SipPreDefined] Got notify ' + JSON.stringify(result));
								} else if(event === 'transfer') {
									Janus.log('[Sip] Got a transfer reqeuest, ignoring :' + JSON.stringify(result));
								} else if(event === 'hangup') {
									Janus.log("[SipPreDefined] Call hung up (" + result["code"] + " " + result["reason"] + ")!");
									// Reset status
									sipcall.hangup();
									$('#myvideo').remove();
									$('#videos').hide();
								}
							}
						},
// Local Stream part						
						onlocalstream: function(stream) {
							Janus.debug("[SipPreDefined] ::: Got a local stream :::", stream);
							$('#videos').removeClass('hide').show();

							// Create video box
							if($('#myvideo').length === 0) {
								$('#videoleft').append('<video class="rounded centered" id="myvideo" width=320 height=240 autoplay playsinline muted="muted"/>');
							}

							Janus.debug("[SipPreDefined] Attaching local stream to #myvideo container");
							// Janus.attachMediaStream($('#myvideo').get(0), stream);
							
							$("#myvideo").get(0).muted = "muted";
							if(sipcall.webrtcStuff.pc.iceConnectionState !== "compvared" &&
									sipcall.webrtcStuff.pc.iceConnectionState !== "connected") {
								$("#videoleft").parent().block({
									message: '<b>Calling...</b>',
									css: {
										border: 'none',
										backgroundColor: 'transparent',
										color: 'white'
									}
								});
								// No remote video yet
								$('#videoright').append('<video class="rounded centered" id="waitingvideo" width=320 height=240 />');
								if(spinner == null) {
									let target = document.getElementById('videoright');
									spinner = new Spinner({top:100}).spin(target);
								} else {
									spinner.spin();
								}
							}
							let videoTracks = stream.getVideoTracks();
							if(!videoTracks || videoTracks.length === 0) {
								// No webcam
								$('#myvideo').hide();
								if($('#videoleft .no-video-container').length === 0) {
									$('#videoleft').append(
										'<div class="no-video-container">' +
											'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
											'<span class="no-video-text">No webcam available</span>' +
										'</div>');
								}
							} else {
								$('#videoleft .no-video-container').remove();
								$('#myvideo').removeClass('hide').show();
							}
						},
// Remote stream part
						onremotestream: function(stream) {
							Janus.debug("[SipPreDefined] ::: Got a remote stream :::", stream);
							if($('#remotevideo').length === 0) {
								$('#videoright').append(
									'<video class="rounded centered hide" id="remotevideo" width=320 height=240 autoplay playsinline/>');
								// Show the peer and hide the spinner when we get a playing event
								$("#remotevideo").bind("playing", function () {
									$('#waitingvideo').remove();
									if(this.videoWidth)
										$('#remotevideo').removeClass('hide').show();
									if(spinner)
										spinner.stop();
									spinner = null;
								});
							}

							Janus.debug("[SipPreDefined] Attaching remote stream to #remotevideo container");
							Janus.attachMediaStream($('#remotevideo').get(0), stream);
							let videoTracks = stream.getVideoTracks();

							if(!videoTracks || videoTracks.length === 0) {
								// No remote video
								$('#remotevideo').hide();
								if($('#videoright .no-video-container').length === 0) {
									$('#videoright').append(
										'<div class="no-video-container">' +
											'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
											'<span class="no-video-text">No remote video available</span>' +
										'</div>');
								}
							} else {
								$('#videoright .no-video-container').remove();
								$('#remotevideo').removeClass('hide').show();
							}

							// Show video button
							$('#videostart').removeClass('hidden').click(startVideo);
						},
// End streams part
						oncleanup: function() {
							Janus.log("[SipPreDefined] ::: Got a cleanup notification :::");
							if(sipcall)
								sipcall.callId = null;
						}
					});
				},
				error: function(error) {
					callback(error, null);
					return;
				},
				destroyed: function() {
					window.location.reload();
				}
		});
	}});
}

function registerUsername(account) {
	// Try a registration
	let register = {
		request: "register",
		username: "sip:" + account + "@" + sip_proxy,
		authuser: account,
		display_name: "Test " + account,
		secret: account,
		proxy: "sip" + sip_proxy + ":" + sip_proxy_port,
	};

	sipcall.send({ message: register });
}

function doSipAudioCall(destination) {

	Janus.log("[SipPreDefined] This is a SIP audio call to " + destination);

	sipcall.createOffer(
		{
			media: {
				audioSend: true, 
				audioRecv: true,		// We DO want audio
				videoSend: false, 
				videoRecv: false		// We DO NOT want video
			},
			success: function(jsep) {
				Janus.debug("[SipPreDefined] Got SDP!", jsep);
				let body = { 
					request: "call", 
					uri: "sip:" + destination + "@" + sip_proxy + ":" + sip_proxy_port, 
				};
				sipcall.send({ 
					message: body, 
					jsep: jsep 
				});
			},
			error: function(error) {
				Janus.error("[SipPreDefined][actuallyDoCall] No SSL on host? WebRTC error...", error);
			}
		});
}

function doHangup() {

	let hangup = { 
		request: "hangup" 
	};
	Janus.debug("[SipPreDefined][doHangup] Call hangup...");
	sipcall.send({ message: hangup });
	sipcall.hangup();
	window.location.reload();
}


function startVideo() {
	Janus.debug("[SipPreDefined][startVideo] Starting new plugin...");

	janus.attach({
		plugin: "janus.plugin.echotest",
		opaqueId: echoOpaqueId,
		success: function(pluginHandle) {
			echotest = pluginHandle;
			Janus.log("[SipPreDefined][startVideo] Echo plugin attached! (" + echotest.getPlugin() + ", id=" + echotest.getId() + ")");
			// Negotiate WebRTC
			var body = { 
				audio: false, 
				video: true 
			};
			Janus.debug("[SipPreDefined][startVideo] Sending message:", body);
			echotest.send({ message: body });
			Janus.debug("[SipPreDefined][startVideo] Trying a createOffer too (video sendrecv)");

			echotest.createOffer(
				{
					// No media provided: by default, it's sendrecv for audio and video
					media: { 
						data: false,
						video: true,
						audio: false
					},
					success: function(jsep) {
						Janus.debug("[SipPreDefined][startVideo] Got SDP!", jsep);
						echotest.send({ message: body, jsep: jsep });
					},
					error: function(error) {
						Janus.error("[SipPreDefined][startVideo] WebRTC error:", error);
					}
				});
		},
		error: function(error) {
			console.error("[SipPreDefined][startVideo]  -- Error attaching plugin...", error);
		},
		iceState: function(state) {
			Janus.log("[SipPreDefined][startVideo] ICE state changed to " + state);
		},
		mediaState: function(medium, on) {
			Janus.log("[SipPreDefined][startVideo] Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
		},
		webrtcState: function(on) {
			Janus.log("[SipPreDefined][startVideo] Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
		},
		slowLink: function(uplink, lost) {
			Janus.warn("[SipPreDefined][startVideo] Janus reports problems " + (uplink ? "sending" : "receiving") +
				" packets on this PeerConnection (" + lost + " lost packets)");
		},
		onmessage: function(msg, jsep) {
			Janus.debug("[SipPreDefined][startVideo]  ::: Got a message :::", msg);
			if(jsep) {
				Janus.debug("[SipPreDefined][startVideo] Handling SDP as well...", jsep);
				echotest.handleRemoteJsep({ jsep: jsep });
			}
		},
		onlocalstream: function(stream) {
			Janus.debug("[SipPreDefined][startVideo] ::: Got a local stream, attaching to #myvideo", stream);

			$('#videoright_echo').append('<video class="rounded centered" id="waitingvideo_echo" width=320 height=240 />');

			$('#videos').removeClass('hide').show();

			// Create video box
			if($('#myvideo').length === 0) {
				$('#videoleft').append('<video class="rounded centered" id="myvideo" width=320 height=240 autoplay playsinline muted="muted"/>');
			}

			Janus.debug("[SipPreDefined] Attaching local stream to #myvideo container");
			Janus.attachMediaStream($('#myvideo').get(0), stream);
			
			$("#myvideo").get(0).muted = "muted";
			if(sipcall.webrtcStuff.pc.iceConnectionState !== "compvared" &&
					sipcall.webrtcStuff.pc.iceConnectionState !== "connected") {
				$("#videoleft").parent().block({
					message: '<b>Calling...</b>',
					css: {
						border: 'none',
						backgroundColor: 'transparent',
						color: 'white'
					}
				});
			}
			let videoTracks = stream.getVideoTracks();
			if(!videoTracks || videoTracks.length === 0) {
				// No webcam
				$('#myvideo').hide();
				if($('#videoleft .no-video-container').length === 0) {
					$('#videoleft').append(
						'<div class="no-video-container">' +
							'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
							'<span class="no-video-text">No webcam available</span>' +
						'</div>');
				}
			} else {
				$('#videoleft .no-video-container').remove();
				$('#myvideo').removeClass('hide').show();
			}

			// Janus.attachMediaStream($('#myvideo').get(0), stream);
		},
		onremotestream: function(stream) {
			Janus.debug("[SipPreDefined][startVideo] ::: Got a remote stream, attaching to same video...", stream);

			if($('#remotevideo_echo').length === 0) {
				$('#videoright_echo').append(
					'<video class="rounded centered hide" id="remotevideo_echo" width=320 height=240 autoplay playsinline/>');
				// Show the peer and hide the spinner when we get a playing event
				$("#remotevideo_echo").bind("playing", function () {
					$('#waitingvideo_echo').remove();
					if(this.videoWidth)
						$('#remotevideo_echo').removeClass('hide').show();
					if(spinner)
						spinner.stop();
					spinner = null;
				});
			}

			Janus.debug("[SipPreDefined] Attaching remote stream to #remotevideo_echo container");
			Janus.attachMediaStream($('#remotevideo_echo').get(0), stream);
			let videoTracks = stream.getVideoTracks();

			if(!videoTracks || videoTracks.length === 0) {
				// No remote video
				$('#remotevideo_echo').hide();
				if($('#videoright_echo .no-video-container').length === 0) {
					$('#videoright_echo').append(
						'<div class="no-video-container">' +
							'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
							'<span class="no-video-text">No remote video available</span>' +
						'</div>');
				}
			} else {
				$('#videoright_echo .no-video-container').remove();
				$('#remotevideo_echo').removeClass('hide').show();
			}
		}
	});
}