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
// 		var server = "/janus";
//
// which will take care of this on its own.
//
//
// If you want to use the WebSockets frontend to Janus, instead, you'll
// have to pass a different kind of address, e.g.:
//
// 		var server = "ws://" + window.location.hostname + ":8188";
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
//		var server = [
//			"ws://" + window.location.hostname + ":8188",
//			"/janus"
//		];
//
// This will tell the library to try connecting to each of the servers
// in the presented order. The first working server will be used for
// the whole session.
//
var server = null;
if(window.location.protocol === 'http:')
	server = "http://" + window.location.hostname + ":8088/janus";
else
	server = "https://" + window.location.hostname + ":8089/janus";

var janus = null;
var sipcall = null;
var opaqueId = "siptest-" + Janus.randomString(12);

var spinner = null;

var selectedApproach = null;
var registered = false;
var masterId = null, helpers = {}, helpersCount = 0;

var incoming = null;


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
							opaqueId: opaqueId,
							success: function(pluginHandle) {
								$('#details').remove();
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
								var error = msg["error"];
								if(error) {
									callback("[SipPreDefined] Message error: " + error, null);
								}
								var callId = msg["call_id"];
								var result = msg["result"];
								if(result && result["event"]) {
									var event = result["event"];
									// Event Switch

									if (event === 'registration_failed') {
										callback("[SipPreDefined] Registration failed: " + result["code"] + " " + result["reason"], null);
										return;
									} else if (event === 'registered') {
										Janus.log("[SipPreDefined] Successfully registered as " + result["username"] + "!");
									} else if(event === 'calling') {
										Janus.log("[SipPreDefined] Waiting for the peer to answer...");
										// TODO Any ringtone?
									} else if (event === 'incomingcall') {
										Janus.log("Incoming call from " + result["username"] + ", ignoring....");										
									} else if(event === 'accepting') {
										// Response to an offerless INVITE, let's wait for an 'accepted'
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
										toastr.success("Call accepted!");
										sipcall.callId = callId;
									} else if (event === 'updatingcall') {
										// We got a re-INVITE: while we may prompt the user (e.g.,
										// to notify about media changes), to keep things simple
										// we just accept the update and send an answer right away
										Janus.log("[SipPreDefined] Got re-INVITE");
										var doAudio = (jsep.sdp.indexOf("m=audio ") > -1),
											doVideo = (jsep.sdp.indexOf("m=video ") > -1);
										sipcall.createAnswer(
											{
												jsep: jsep,
												media: { audio: doAudio, video: doVideo },
												success: function(jsep) {
													Janus.debug("[SipPreDefined] Got SDP " + jsep.type + "! audio=" + doAudio + ", video=" + doVideo + ":", jsep);
													var body = { request: "update" };
													sipcall.send({ message: body, jsep: jsep });
												},
												error: function(error) {
													Janus.log("[SipPreDefined] WebRTC error... " + error.message, null);
												}
											});
									} else if (event === 'message') {
										// We got a MESSAGE
										var sender = result["displayname"] ? result["displayname"] : result["sender"];
										var content = result["content"];
										content = content.replace(new RegExp('<', 'g'), '&lt');
										content = content.replace(new RegExp('>', 'g'), '&gt');
										toastr.success(content, "Message from " + sender);
										Janus.log('[SipPreDefined] Got message ' + JSON.stringify(result));
									} else if(event === 'info') {
										// We got an INFO
										var sender = result["displayname"] ? result["displayname"] : result["sender"];
										var content = result["content"];
										content = content.replace(new RegExp('<', 'g'), '&lt');
										content = content.replace(new RegExp('>', 'g'), '&gt');
										toastr.info(content, "Info from " + sender);
										Janus.log('[SipPreDefined] Got info ' + JSON.stringify(result));
									} else if(event === 'notify') {
										// We got a NOTIFY
										var notify = result["notify"];
										var content = result["content"];
										toastr.info(content, "Notify (" + notify + ")");
										Janus.log('[SipPreDefined] Got notify ' + JSON.stringify(result));
									} else if(event === 'transfer') {
										Janus.log('[Sip] Got a transfer reqeuest, ignoring :' + JSON.stringify(result));
									} else if(event === 'hangup') {
										Janus.log("[SipPreDefined] Call hung up (" + result["code"] + " " + result["reason"] + ")!");
										// Reset status
										sipcall.hangup();
									}
								}
							},
							onlocalstream: function(stream) {
								Janus.debug("[SipPreDefined] ::: Got a local stream :::", stream);
								$('#videos').removeClass('hide').show();
								if($('#myvideo').length === 0)
									$('#videoleft').append('<video class="rounded centered" id="myvideo" width=320 height=240 autoplay playsinline muted="muted"/>');
								Janus.attachMediaStream($('#myvideo').get(0), stream);
								$("#myvideo").get(0).muted = "muted";
								if(sipcall.webrtcStuff.pc.iceConnectionState !== "completed" &&
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
										var target = document.getElementById('videoright');
										spinner = new Spinner({top:100}).spin(target);
									} else {
										spinner.spin();
									}
								}
								var videoTracks = stream.getVideoTracks();
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
							onremotestream: function(stream) {
								Janus.debug(" ::: Got a remote stream :::", stream);
								if($('#remotevideo').length === 0) {
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
								Janus.attachMediaStream($('#remotevideo').get(0), stream);
								var videoTracks = stream.getVideoTracks();
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
							},
							oncleanup: function() {
								Janus.log(" ::: Got a cleanup notification :::");
								$('#myvideo').remove();
								$('#waitingvideo').remove();
								$('#remotevideo').remove();
								$('#videos .no-video-container').remove();
								$('#videos').hide();
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
		username: "sip:" + account + "@127.0.0.1",
		authuser: account,
		display_name: "Test " + account,
		secret: account,
		proxy: "sip:127.0.0.1:5061"
	};

	sipcall.send({ message: register });
}

function doCall(ev) {
	// Call someone (from the main session or one of the helpers)
	var button = ev ? ev.currentTarget.id : "call";
	var helperId = button.split("call")[1];
	if(helperId === "")
		helperId = null;
	else
		helperId = parseInt(helperId);
	var handle = helperId ? helpers[helperId].sipcall : sipcall;
	var prefix = helperId ? ("[Helper #" + helperId + "]") : "";
	var suffix = helperId ? (""+helperId) : "";
	$('#peer' + suffix).attr('disabled', true);
	$('#call' + suffix).attr('disabled', true).unbind('click');
	$('#dovideo' + suffix).attr('disabled', true);
	var username = $('#peer' + suffix).val();
	if(username === "") {
		bootbox.alert('Please insert a valid SIP address (e.g., sip:pluto@example.com)');
		$('#peer' + suffix).removeAttr('disabled');
		$('#dovideo' + suffix).removeAttr('disabled');
		$('#call' + suffix).removeAttr('disabled').click(function() { doCall(helperId); });
		return;
	}
	if(username.indexOf("sip:") != 0 || username.indexOf("@") < 0) {
		bootbox.alert('Please insert a valid SIP address (e.g., sip:pluto@example.com)');
		$('#peer' + suffix).removeAttr('disabled').val("");
		$('#dovideo' + suffix).removeAttr('disabled').val("");
		$('#call' + suffix).removeAttr('disabled').click(function() { doCall(helperId); });
		return;
	}
	// Call this URI
	doVideo = $('#dovideo' + suffix).is(':checked');
	Janus.log(prefix + "This is a SIP " + (doVideo ? "video" : "audio") + " call (dovideo=" + doVideo + ")");
	actuallyDoCall(handle, $('#peer' + suffix).val(), doVideo);
}
function actuallyDoCall(handle, uri, doVideo, referId) {
	handle.createOffer(
		{
			media: {
				audioSend: true, audioRecv: true,		// We DO want audio
				videoSend: doVideo, videoRecv: doVideo	// We MAY want video
			},
			success: function(jsep) {
				Janus.debug("Got SDP!", jsep);
				// By default, you only pass the SIP URI to call as an
				// argument to a "call" request. Should you want the
				// SIP stack to add some custom headers to the INVITE,
				// you can do so by adding an additional "headers" object,
				// containing each of the headers as key-value, e.g.:
				//		var body = { request: "call", uri: $('#peer').val(),
				//			headers: {
				//				"My-Header": "value",
				//				"AnotherHeader": "another string"
				//			}
				//		};
				var body = { request: "call", uri: uri };
				// Note: you can also ask the plugin to negotiate SDES-SRTP, instead of the
				// default plain RTP, by adding a "srtp" attribute to the request. Valid
				// values are "sdes_optional" and "sdes_mandatory", e.g.:
				//		var body = { request: "call", uri: $('#peer').val(), srtp: "sdes_optional" };
				// "sdes_optional" will negotiate RTP/AVP and add a crypto line,
				// "sdes_mandatory" will set the protocol to RTP/SAVP instead.
				// Just beware that some endpoints will NOT accept an INVITE
				// with a crypto line in it if the protocol is not RTP/SAVP,
				// so if you want SDES use "sdes_optional" with care.
				// Note 2: by default, the SIP plugin auto-answers incoming
				// re-INVITEs, without involving the browser/client: this is
				// for backwards compatibility with older Janus clients that
				// may not be able to handle them. If you want to receive
				// re-INVITES to handle them yourself, specify it here, e.g.:
				//		body["autoaccept_reinvites"] = false;
				if(referId) {
					// In case we're originating this call because of a call
					// transfer, we need to provide the internal reference ID
					body["refer_id"] = referId;
				}
				handle.send({ message: body, jsep: jsep });
			},
			error: function(error) {
				Janus.error(prefix + "WebRTC error...", error);
				bootbox.alert("WebRTC error... " + error.message);
			}
		});
}

function doHangup(ev) {
	// Hangup a call (on the main session or one of the helpers)
	var button = ev ? ev.currentTarget.id : "call";
	var helperId = button.split("call")[1];
	if(helperId === "")
		helperId = null;
	else
		helperId = parseInt(helperId);
	if(!helperId) {
		$('#call').attr('disabled', true).unbind('click');
		var hangup = { request: "hangup" };
		sipcall.send({ message: hangup });
		sipcall.hangup();
	} else {
		$('#call' + helperId).attr('disabled', true).unbind('click');
		var hangup = { request: "hangup" };
		helpers[helperId].sipcall.send({ message: hangup });
		helpers[helperId].sipcall.hangup();
	}
}