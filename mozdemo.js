// Boilerplate
function ui_log(msg) {
    color_log(msg, "green");
}
var color_log = function(msg, color) {
    var log = msg.replace("\\r\\n", "<br/>");

    var d = document.createElement("div");
    d.style.color = color;
    d.innerHTML = log;

    var node = document.getElementById("logwindow");

    if (node.firstChild) {
      node.insertBefore(d, node.firstChild);
    } else {
      node.appendChild(d);
    }
};

var out_queue = []
var in_queue = null;




function ajax(params) {
  color_log("ajax: " + JSON.stringify(params), "blue");
  if (params.type == "POST") {
    window.messageBus.send(senderId, params.data);
  } else {
    if (in_queue) {
      params.success(in_queue.pop());
    } else if (window.location.search) {
      var query = window.location.search.substring(1);
      in_queue = JSON.parse(decodeURIComponent(query));
      ajax(params);
    } else {
      params.success();
    }
  }

}

default_config = {"optional": [{"DtlsSrtpKeyAgreement": true}]};

var CallingClient = function(config_, username, peer, divs, start_call, other_params) {
    console.log("Calling client constructor");
    var poll_timeout = 1000; // ms
    var config = config_;
    var state = "INIT";

    var audio_stream = undefined;
    var video_stream = undefined;
    var pc = undefined;

    var log = function(msg) {
        console.log("LOG (" + username + "): " + msg);
        ui_log("LOG (" + username + "): " + msg);
    };

    var poll_success = function(msg) {
	if (!msg) {
	    poll_error();
	    return;
	}
	log("Received raw message " + msg);
        var js = JSON.parse(msg);
	
        log("Received message " + JSON.stringify(js));

	sdp = js.body;
	
        if (sdp) {
	    if (sdp.sdp) {
	        if (sdp.type === "offer") {
		    process_offer(sdp);
	        } else if (sdp.type === "answer") {
		    process_answer(sdp);
	        }
	    } else {
	        process_ice_candidate(sdp);
	    }
        }

        setTimeout(poll, poll_timeout);
    };
    
    var poll_error = function (msg) {
        setTimeout(poll, poll_timeout);
    };
    
    var poll = function () {
        ajax({
                 url: "/msg/" + username + "/",
                 success: poll_success,
                 error: poll_error
             });
    };

    var failure = function(x) {
        log("ERROR: " + JSON.stringify(x));
    };


    // Signaling methods    
    var send_sdpdescription= function(sdp) {
	var msg = {
	    dest:peer,
	    body: sdp
	};

	log("Sending: " + JSON.stringify(msg));

	ajax({
		 url : "/msg/",
		 type:"POST",
		 contentType:"application/json",
		 data: JSON.stringify(msg),
	     });
    };


    var deobjify = function(x) {
	return JSON.parse(JSON.stringify(x));
    };


    var process_offer = function(sdp) {
	ui_log("Applying offer");
	pc.setRemoteDescription(new RTCSessionDescription(sdp),
				set_remote_offer_success, failure);
    };

    var process_answer = function(sdp) {
	log("Applying answer");
	pc.setRemoteDescription(new RTCSessionDescription(sdp),
				set_remote_answer_success, failure);
    };

    var process_ice_candidate = function(msg) {
	log("Applying ICE candidate");
	pc.addIceCandidate(new RTCIceCandidate(msg));
    };

    var set_remote_offer_success = function() {
    	ui_log("Successfully applied offer");
	pc.createAnswer(create_answer_success, failure);
    };

    var set_remote_answer_success= function() {
    	log("Successfully applied answer.");
        if (other_params.demo) {
//            divs.remote_video.mozRequestFullScreen();
        }
    };

    var set_local_success_offer = function(sdp) {
	log("Successfully applied local description");
	send_sdpdescription(sdp);
    };

    var set_local_success_answer = function(sdp) {
	log("Successfully applied local description");
	send_sdpdescription(sdp);
        if (other_params.demo) {
//            divs.remote_video.mozRequestFullScreen();
        }
    };

    var filter_nonrelay_candidates = function(sdp) {
        var lines = sdp.sdp.split("\r\n");
        var lines2 = lines.filter(function(x) {
            if (!/candidate/.exec(x))
                return true;
            if (/relay/.exec(x))
                return true;
            
            return false;
        });

        sdp.sdp = lines2.join("\r\n");
    };

    var create_offer_success = function(sdp) {

	log("Successfully created offer " + JSON.stringify(sdp));

        if (other_params.turn_only) {
            filter_nonrelay_candidates(sdp);
            log("Sending " + JSON.stringify(sdp));
        }

	pc.setLocalDescription(sdp,
			       function() {
				   set_local_success_offer(sdp);
			       },
			       failure);
    };

    var create_answer_success = function(sdp) {
	log("Successfully created answer " + JSON.stringify(sdp));
        if (other_params.turn_only) {
            filter_nonrelay_candidates(sdp);
            log("Sending " + JSON.stringify(sdp));
        }

	pc.setLocalDescription(sdp,
			       function() {
				   set_local_success_answer(sdp);
			       },
			       failure);
    };

    var on_ice_candidate = function (candidate) {
	log("New ICE candidate");
	send_sdpdescription(candidate.candidate);
    };
 
    var on_signaling_state_change = function() {
	log("Signaling state change. New state = " + pc.signalingState);
    };

    var on_ice_connection_state_change = function() {
	log("Ice state change. New state = " + pc.iceConnectionState);
    };

    var on_ice_state_change = function(x) {
	log("Ice state change. New state = " + x);
    };

    var ready = function() {
	log("start_call=" + start_call);

        if (start_call) {
            log("Making call to " + peer);
	    pc.createOffer(create_offer_success, failure);

        } else {
            log("Waiting for call as " + username);
        }

        // Start polling
        poll();
    };

    var config = {};

    var ice_servers = [];

    if (other_params.ss) {
        ice_servers.push({"url":"stun:" + other_params.ss});
    }
    else {
        ice_servers.push({"url":"stun:stun.services.mozilla.com"});
    }

    if (other_params.ts && other_params.tu && other_params.tp) {
        ice_servers.push({
            "url":"turn:" + other_params.ts,
            "username":other_params.tu,
            "credential":other_params.tp
        });
    }
    if (other_params.tt && other_params.tu && other_params.tp) {
        ice_servers.push({
            "url":"turn:" + other_params.tt + "?transport=tcp",
            "username":other_params.tu,
            "credential":other_params.tp
        });
    }

    if (ice_servers.length) {
        config.iceServers = ice_servers;
    }
    
    log("Calling client: user=" + username + " peer = " + peer);
//    var config = {};
    log("Config = " + JSON.stringify(config));
    var pc = new RTCPeerConnection(config, {});
    
    if (pc) {
        log("Created PC object");
    }
    else {
        log("Failure creating Webrtc object");
    }

    // Set callbacks or new media streams
    pc.onaddstream = function(obj) {
	color_log("Got remote stream", "yellow");
        attachMediaStream(divs.remote_video, obj.stream);
    };
    pc.onicecandidate = on_ice_candidate;
    pc.onsignalingstatechange = on_signaling_state_change;
    pc.oniceconnectionstatechange = on_ice_connection_state_change;
    pc.onicechange = on_ice_state_change;

    // Start.
    log("Calling get user media");
    // Get the video stream
    
    var params = {};
    if (extra.video) {
        params.video = true;
    }
    if (extra.audio) {
        params.audio = true;
    }
    if (extra.fake) {
        params.fake = true;
    }

    if (start_call) {
    
    getUserMedia(params, function(stream){
                     // Attach to the local element
                     log("Got video stream");
                     attachMediaStream(divs.local_video, stream);
		     pc.addStream(stream);
		     ready();
                 },
                 function() {
                     log("Could not get video stream");
                 });
    } else {
      poll();
    }
};

