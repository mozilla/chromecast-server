var failure = function(x) {
  log("ERROR: " + JSON.stringify(x));
};

var log = function(msg) {
  console.log("LOG(CallingClient): " + msg);
};

var CallingClient = function(divs) {
  log("Calling client constructor");

  var config = {}
  config.iceServers = [];
  config.iceServers.push({"url":"stun:stun.services.mozilla.com"});

  this.pc = new RTCPeerConnection(config, {});

  if (this.pc) {
    log("Created PC object");
  } else {
    log("Failure creating Webrtc object");
  }

  // Set callbacks or new media streams
  this.pc.onaddstream = function(obj) {
    log("Adding video stream");
    attachMediaStream(divs.remote_video, obj.stream);
  }
  this.pc.onicecandidate = this._onIceCandidate.bind(this);
  this.pc.onsignalingstatechange = this._onSignalingStateChange.bind(this);
  this.pc.oniceconnectionstatechange = this._onIceConnectionStateChange.bind(this);
  this.pc.onicechange = this._onIceStateChange.bind(this);
};

CallingClient.prototype = {

  processEvent: function(senderId, msg) {
    if (!msg) {
      return;
    }
    this.senderId = senderId;
    log("Received raw message " + msg);
    var data = JSON.parse(msg);

    log("Received message " + JSON.stringify(data));

    if (data) {
      if (data.sdp) {
        if (data.type === "offer") {
           this._processOffer(data);
        } else {
          log("Unhandle sdp type: " + data.type);
        }
      } else {
        this._processIceCandidate(data);
      }
    }
  },

  // Signaling methods
  _sendMessage: function(msg) {
    log("Sending: " + JSON.stringify(msg));
    window.messageBus.send(this.senderId, JSON.stringify(msg));
  },

  _processOffer: function(sdp) {
    log("Applying offer");
    this.pc.setRemoteDescription(new RTCSessionDescription(sdp),
                                 this._setRemoteOfferSuccess.bind(this), failure);
  },

  _processIceCandidate: function(msg) {
    log("Applying ICE candidate: " + JSON.stringify(msg));
    this.pc.addIceCandidate(new RTCIceCandidate(msg));
  },

  _setRemoteOfferSuccess: function() {
    log("Successfully applied offer");
    this.pc.createAnswer(this._createAnswerSuccess.bind(this), failure);
  },

  _setLocalSuccessAnswer: function(sdp) {
    log("Successfully applied local description: " + JSON.stringify(sdp));
  },

  _filterNonrelayCandidates: function(sdp) {
    var lines = sdp.sdp.split("\r\n");
    var lines2 = lines.filter(function(x) {
      if (!/candidate/.exec(x)) {
        return true;
      } else if (/relay/.exec(x)) {
        return true;
      }
      return false;
    });

    sdp.sdp = lines2.join("\r\n");
  },

  _createAnswerSuccess: function(sdp) {
    log("Successfully created answer " + JSON.stringify(sdp));
    this._filterNonrelayCandidates(sdp);
    this._sendMessage(sdp);
    this.pc.setLocalDescription(sdp, this._setLocalSuccessAnswer, failure);
  },

  _onIceCandidate: function (candidate) {
    log("New ICE candidate");
    this._sendMessage(candidate.candidate);
  },

  _onSignalingStateChange: function() {
    log("Signaling state change. New state = " + this.pc.signalingState);
  },

  _onIceConnectionStateChange: function() {
    log("Ice state change. New state = " + this.pc.iceConnectionState);
  },

  _onIceStateChange: function(x) {
    log("Ice state change. New state = " + x);
  },
};
