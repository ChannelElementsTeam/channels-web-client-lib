/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 1);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var text_encoding_utf_8_1 = __webpack_require__(4);
var Utils = (function () {
    function Utils() {
    }
    Utils.createAuth = function (registry) {
        var user = registry.id;
        var pswd = registry.token;
        return 'Basic ' + Utils.base64([user, pswd].join(':'));
    };
    Utils.base64 = function (input) {
        return btoa(input);
    };
    return Utils;
}());
exports.Utils = Utils;
var ChannelMessageUtils = (function () {
    function ChannelMessageUtils() {
    }
    ChannelMessageUtils.serializeControlMessage = function (requestId, type, details, binaryPortion) {
        var controlMessage = {
            type: type,
            details: details
        };
        if (requestId) {
            controlMessage.requestId = requestId;
        }
        var messageInfo = {
            channelCode: 0,
            senderCode: 0,
            history: false,
            priority: false,
            jsonMessage: controlMessage,
            binaryPayload: binaryPortion
        };
        return this.serializeChannelMessage(messageInfo, 0, 0);
    };
    ChannelMessageUtils.serializeChannelMessage = function (messageInfo, lastTimestampSent, clockSkew) {
        // Allocate the proper length...
        var jsonPayloadBuffer;
        var length = this.MESSAGE_HEADER_LENGTH;
        if (messageInfo.jsonMessage) {
            length += 4;
            if (messageInfo.jsonMessage) {
                jsonPayloadBuffer = new text_encoding_utf_8_1.TextEncoder().encode(JSON.stringify(messageInfo.jsonMessage));
                length += jsonPayloadBuffer.byteLength;
            }
        }
        if (messageInfo.binaryPayload) {
            length += messageInfo.binaryPayload.byteLength;
        }
        var result = new Uint8Array(length);
        var view = new DataView(result.buffer);
        // Populate the header...
        var timestamp = Date.now() + clockSkew;
        if (timestamp <= lastTimestampSent) {
            timestamp = lastTimestampSent + 1;
        }
        view.setUint16(0, this.CHANNEL_ELEMENTS_VERSION_V1);
        var topTime = Math.floor(timestamp / (Math.pow(2, 32)));
        view.setUint16(2, topTime);
        var remainder = timestamp - (topTime * Math.pow(2, 32));
        view.setUint32(4, remainder);
        view.setUint32(8, messageInfo.channelCode ? messageInfo.channelCode : 0);
        view.setUint32(12, messageInfo.senderCode ? messageInfo.senderCode : 0);
        var behavior = 0;
        if (messageInfo.priority) {
            behavior |= 0x01;
        }
        if (messageInfo.history) {
            behavior |= 0x02;
        }
        view.setUint8(16, behavior);
        result.fill(0, 17, this.MESSAGE_HEADER_LENGTH);
        // Now the payload...
        var offset = this.MESSAGE_HEADER_LENGTH;
        if (jsonPayloadBuffer) {
            view.setUint32(offset, jsonPayloadBuffer.byteLength);
            offset += 4;
            result.set(jsonPayloadBuffer, offset);
            offset += jsonPayloadBuffer.byteLength;
        }
        if (messageInfo.binaryPayload) {
            result.set(messageInfo.binaryPayload, offset);
        }
        return result;
    };
    ChannelMessageUtils.parseChannelMessage = function (message, enforceClockSync) {
        if (enforceClockSync === void 0) { enforceClockSync = true; }
        var result = {
            valid: false,
            rawMessage: message
        };
        if (message.length < this.MESSAGE_HEADER_LENGTH) {
            result.errorMessage = 'Message is too short';
            return result;
        }
        var view = new DataView(message.buffer, message.byteOffset);
        if (view.getUint16(0) !== this.CHANNEL_ELEMENTS_VERSION_V1) {
            result.errorMessage = 'Message prefix is invalid.  Incorrect protocol?';
            return result;
        }
        var topBytes = view.getUint16(2);
        var bottomBytes = view.getUint32(4);
        var timestamp = topBytes * Math.pow(2, 32) + bottomBytes;
        var delta = Date.now() - timestamp;
        if (enforceClockSync && Math.abs(delta) > 15000) {
            result.valid = false;
            result.errorMessage = "Clocks are too far out of sync, or message timestamp is invalid";
            return result;
        }
        var behavior = view.getUint8(16);
        var contents = {
            serializedMessage: message,
            timestamp: timestamp,
            channelCode: view.getUint32(8),
            senderCode: view.getUint32(12),
            priority: (behavior & 0x01) ? true : false,
            history: (behavior & 0x02) ? true : false,
            fullPayload: new Uint8Array(message.buffer, message.byteOffset + this.MESSAGE_HEADER_LENGTH, message.byteLength - this.MESSAGE_HEADER_LENGTH)
        };
        result.contents = contents;
        result.valid = true;
        if (contents.channelCode === 0 && contents.senderCode === 0) {
            var jsonLength = view.getUint32(this.MESSAGE_HEADER_LENGTH);
            try {
                var jsonString = new text_encoding_utf_8_1.TextDecoder("utf-8").decode(message.subarray(this.MESSAGE_HEADER_LENGTH + 4, this.MESSAGE_HEADER_LENGTH + 4 + jsonLength));
                contents.controlMessagePayload = {
                    jsonMessage: JSON.parse(jsonString)
                };
                if (message.byteLength > this.MESSAGE_HEADER_LENGTH + 4 + jsonLength) {
                    contents.controlMessagePayload.binaryPortion = new Uint8Array(contents.fullPayload.buffer, contents.fullPayload.byteOffset + 4 + jsonLength, contents.fullPayload.byteLength - 4 - jsonLength);
                }
            }
            catch (err) {
                result.valid = false;
                result.errorMessage = "Invalid control message payload";
            }
        }
        return result;
    };
    ChannelMessageUtils.MESSAGE_HEADER_LENGTH = 32;
    ChannelMessageUtils.CHANNEL_ELEMENTS_VERSION_V1 = 0xCEB1;
    return ChannelMessageUtils;
}());
exports.ChannelMessageUtils = ChannelMessageUtils;


/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var rest_1 = __webpack_require__(2);
var db_1 = __webpack_require__(3);
var utils_1 = __webpack_require__(0);
var transport_1 = __webpack_require__(5);
var ChannelsClient = (function () {
    function ChannelsClient() {
        var _this = this;
        this.joinedChannels = {};
        this.joinedChannelsByCode = {};
        this.historyCallbacks = {};
        this.channelMessageCallbacks = {};
        this.channelParticipantListeners = {};
        this.channelDeletedListeners = [];
        this.db = new db_1.ClientDb();
        this.transport = new transport_1.TransportManager();
        this.transport.historyMessageHandler = function (details, message) {
            var joinInfo = _this.joinedChannelsByCode[message.channelCode];
            if (joinInfo) {
                var cbList = _this.historyCallbacks[joinInfo.channelId];
                if (cbList) {
                    for (var _i = 0, cbList_1 = cbList; _i < cbList_1.length; _i++) {
                        var cb = cbList_1[_i];
                        try {
                            cb(details, message);
                        }
                        catch (er) { }
                    }
                }
            }
        };
        this.transport.channelMessageHandler = function (message, err) {
            if (!err) {
                var joinInfo = _this.joinedChannelsByCode[message.channelCode];
                if (joinInfo) {
                    var cbList = _this.channelMessageCallbacks[joinInfo.channelId];
                    if (cbList) {
                        for (var _i = 0, cbList_2 = cbList; _i < cbList_2.length; _i++) {
                            var cb = cbList_2[_i];
                            try {
                                cb(message);
                            }
                            catch (er) { }
                        }
                    }
                }
            }
        };
        this.transport.controlMessageHandler = function (message, err) {
            if (!err) {
                _this.handleControlMessage(message);
            }
        };
    }
    ChannelsClient.prototype.handleControlMessage = function (message) {
        var controlMessage = message.controlMessagePayload.jsonMessage;
        switch (controlMessage.type) {
            case 'join-notification': {
                var joinNotification = controlMessage.details;
                var cbList = this.channelParticipantListeners[joinNotification.channelId];
                if (cbList) {
                    for (var _i = 0, cbList_3 = cbList; _i < cbList_3.length; _i++) {
                        var cb = cbList_3[_i];
                        try {
                            cb(joinNotification, null);
                        }
                        catch (er) { }
                    }
                }
                break;
            }
            case 'leave-notification': {
                var leaveNotification = controlMessage.details;
                var cbList = this.channelParticipantListeners[leaveNotification.channelId];
                if (cbList) {
                    for (var _a = 0, cbList_4 = cbList; _a < cbList_4.length; _a++) {
                        var cb = cbList_4[_a];
                        try {
                            cb(null, leaveNotification);
                        }
                        catch (er) { }
                    }
                }
                break;
            }
            case 'channel-deleted': {
                var notification = controlMessage.details;
                if (notification) {
                    for (var _b = 0, _c = this.channelDeletedListeners; _b < _c.length; _b++) {
                        var l = _c[_b];
                        try {
                            l(notification);
                        }
                        catch (er) { }
                    }
                }
                break;
            }
            default: break;
        }
    };
    ChannelsClient.prototype.addChannelDeletedListener = function (listener) {
        if (listener) {
            this.channelDeletedListeners.push(listener);
        }
    };
    ChannelsClient.prototype.removeChannelDeletedListener = function (listener) {
        if (listener) {
            var index = -1;
            for (var i = 0; i < this.channelDeletedListeners.length; i++) {
                if (listener === this.channelDeletedListeners[i]) {
                    index = i;
                    break;
                }
            }
            if (index >= 0) {
                this.channelDeletedListeners.splice(index, 1);
            }
        }
    };
    ChannelsClient.prototype.addChannelParticipantListener = function (channelId, cb) {
        if (channelId && cb) {
            if (!this.channelParticipantListeners[channelId]) {
                this.channelParticipantListeners[channelId] = [];
            }
            this.channelParticipantListeners[channelId].push(cb);
        }
    };
    ChannelsClient.prototype.removeChannelParticipantListener = function (channelId, cb) {
        if (cb && channelId) {
            var list = this.channelParticipantListeners[channelId];
            if (list) {
                var index = -1;
                for (var i = 0; i < list.length; i++) {
                    if (cb === list[i]) {
                        index = i;
                        break;
                    }
                }
                if (index >= 0) {
                    list.splice(index, 1);
                    this.channelParticipantListeners[channelId] = list;
                }
            }
        }
    };
    ChannelsClient.prototype.addChannelMessageListener = function (channelId, cb) {
        if (cb && channelId) {
            if (!this.channelMessageCallbacks[channelId]) {
                this.channelMessageCallbacks[channelId] = [];
            }
            this.channelMessageCallbacks[channelId].push(cb);
        }
    };
    ChannelsClient.prototype.removeChannelMessageListener = function (channelId, cb) {
        if (cb && channelId) {
            var list = this.channelMessageCallbacks[channelId];
            if (list) {
                var index = -1;
                for (var i = 0; i < list.length; i++) {
                    if (cb === list[i]) {
                        index = i;
                        break;
                    }
                }
                if (index >= 0) {
                    list.splice(index, 1);
                    this.channelMessageCallbacks[channelId] = list;
                }
            }
        }
    };
    ChannelsClient.prototype.addHistoryMessageListener = function (channelId, cb) {
        if (cb && channelId) {
            if (!this.historyCallbacks[channelId]) {
                this.historyCallbacks[channelId] = [];
            }
            this.historyCallbacks[channelId].push(cb);
        }
    };
    ChannelsClient.prototype.removeHistoryMessageListener = function (channelId, cb) {
        if (cb && channelId) {
            var list = this.historyCallbacks[channelId];
            if (list) {
                var index = -1;
                for (var i = 0; i < list.length; i++) {
                    if (cb === list[i]) {
                        index = i;
                        break;
                    }
                }
                if (index >= 0) {
                    list.splice(index, 1);
                    this.historyCallbacks[channelId] = list;
                }
            }
        }
    };
    ChannelsClient.prototype.ensureDb = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db.open()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ChannelsClient.prototype.register = function (serverUrl, identity) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, serverInfo, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.db.getRegistry(null, serverUrl)];
                    case 2:
                        cached = _a.sent();
                        if (cached) {
                            return [2 /*return*/, cached];
                        }
                        return [4 /*yield*/, rest_1.Rest.get(serverUrl)];
                    case 3:
                        serverInfo = _a.sent();
                        if (!(serverInfo && serverInfo.services.registrationUrl)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.getRegistry(serverInfo.services.registrationUrl, identity)];
                    case 4:
                        response = _a.sent();
                        return [2 /*return*/, response];
                    case 5: throw new Error("Failed to fetch channel server info.");
                }
            });
        });
    };
    ChannelsClient.prototype.getRegistry = function (registryUrl, identity) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.db.getRegistry(registryUrl)];
                    case 2:
                        cached = _a.sent();
                        if (cached) {
                            return [2 /*return*/, cached];
                        }
                        return [4 /*yield*/, rest_1.Rest.post(registryUrl, {
                                identity: identity || {}
                            })];
                    case 3:
                        response = _a.sent();
                        if (!response) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.db.saveRegistry(response)];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, response];
                    case 5: throw new Error("Failed to register with server at " + registryUrl);
                }
            });
        });
    };
    ChannelsClient.prototype.createChannel = function (registryUrl, request) {
        if (request === void 0) { request = {}; }
        return __awaiter(this, void 0, void 0, function () {
            var registry, headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.db.getRegistry(registryUrl)];
                    case 2:
                        registry = _a.sent();
                        if (!registry) {
                            throw new Error("Failed to create channel: Provider is not registered");
                        }
                        headers = { Authorization: utils_1.Utils.createAuth(registry) };
                        return [4 /*yield*/, rest_1.Rest.post(registry.services.createChannelUrl, request, headers)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ChannelsClient.prototype.shareChannel = function (registerUrl, request) {
        return __awaiter(this, void 0, void 0, function () {
            var registry, headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.db.getRegistry(registerUrl)];
                    case 2:
                        registry = _a.sent();
                        if (!registry) {
                            throw new Error("Failed to create channel: Provider is not registered");
                        }
                        headers = { Authorization: utils_1.Utils.createAuth(registry) };
                        return [4 /*yield*/, rest_1.Rest.post(registry.services.shareChannelUrl, request, headers)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ChannelsClient.prototype.getInviteInfo = function (inviteCode) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, rest_1.Rest.get(inviteCode)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ChannelsClient.prototype.acceptInvitation = function (inviteCode, identity, participantDetails) {
        return __awaiter(this, void 0, void 0, function () {
            var shareCodeResponse, registry, request, headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getInviteInfo(inviteCode)];
                    case 1:
                        shareCodeResponse = _a.sent();
                        if (!shareCodeResponse) {
                            throw new Error("Invalid share code");
                        }
                        return [4 /*yield*/, this.register(shareCodeResponse.providerUrl, identity)];
                    case 2:
                        registry = _a.sent();
                        request = {
                            invitationId: shareCodeResponse.invitationId,
                            details: participantDetails
                        };
                        headers = { Authorization: utils_1.Utils.createAuth(registry) };
                        return [4 /*yield*/, rest_1.Rest.post(shareCodeResponse.acceptChannelUrl, request, headers)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ChannelsClient.prototype.getChannelsWithProvider = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var result, registry, listResponse, _i, _a, cs;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _b.sent();
                        result = [];
                        return [4 /*yield*/, this.db.getRegistry(url)];
                    case 2:
                        registry = _b.sent();
                        if (!!registry) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.db.getRegistry(null, url)];
                    case 3:
                        registry = _b.sent();
                        _b.label = 4;
                    case 4:
                        if (!registry) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.getChannelsFromRegistry(registry)];
                    case 5:
                        listResponse = _b.sent();
                        if (listResponse && listResponse.channels) {
                            for (_i = 0, _a = listResponse.channels; _i < _a.length; _i++) {
                                cs = _a[_i];
                                result.push(cs);
                            }
                        }
                        _b.label = 6;
                    case 6: return [2 /*return*/, result];
                }
            });
        });
    };
    ChannelsClient.prototype.listAllChannels = function () {
        return __awaiter(this, void 0, void 0, function () {
            var registries, result, _i, registries_1, registry, listResponse, _a, _b, cs;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _c.sent();
                        return [4 /*yield*/, this.db.getAllRegistries()];
                    case 2:
                        registries = _c.sent();
                        result = [];
                        _i = 0, registries_1 = registries;
                        _c.label = 3;
                    case 3:
                        if (!(_i < registries_1.length)) return [3 /*break*/, 6];
                        registry = registries_1[_i];
                        return [4 /*yield*/, this.getChannelsFromRegistry(registry)];
                    case 4:
                        listResponse = _c.sent();
                        if (listResponse && listResponse.channels) {
                            for (_a = 0, _b = listResponse.channels; _a < _b.length; _a++) {
                                cs = _b[_a];
                                result.push(cs);
                            }
                        }
                        _c.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6:
                        result.sort(function (a, b) {
                            return b.created - a.created;
                        });
                        return [2 /*return*/, result];
                }
            });
        });
    };
    ChannelsClient.prototype.getChannelsFromRegistry = function (registry) {
        return __awaiter(this, void 0, void 0, function () {
            var headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        headers = { Authorization: utils_1.Utils.createAuth(registry) };
                        return [4 /*yield*/, rest_1.Rest.get(registry.services.channelListUrl, headers)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ChannelsClient.prototype.getChannel = function (registryUrl, channelUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var registry, headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.db.getRegistry(registryUrl)];
                    case 2:
                        registry = _a.sent();
                        if (!registry) {
                            throw new Error("Failed to fetch channel: Provider is not registered");
                        }
                        headers = { Authorization: utils_1.Utils.createAuth(registry) };
                        return [4 /*yield*/, rest_1.Rest.get(channelUrl, headers)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ChannelsClient.prototype.deleteChannel = function (registryUrl, channelDeleteUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var registry, headers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.db.getRegistry(registryUrl)];
                    case 2:
                        registry = _a.sent();
                        if (!registry) {
                            throw new Error("Failed to delete channel: Provider is not registered");
                        }
                        headers = { Authorization: utils_1.Utils.createAuth(registry) };
                        return [4 /*yield*/, rest_1.Rest.delete(channelDeleteUrl, headers)];
                    case 3: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ChannelsClient.prototype.connectTransport = function (registryUrl, channelId, url) {
        return __awaiter(this, void 0, void 0, function () {
            var registry, fullUrl, query;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureDb()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.db.getRegistry(registryUrl)];
                    case 2:
                        registry = _a.sent();
                        if (!registry) {
                            throw new Error("Failed to connect: Provider is not registered");
                        }
                        fullUrl = new URL(url);
                        query = fullUrl.search || "";
                        if (!query) {
                            query = "?";
                        }
                        else if (query.length > 1) {
                            query = query + "&";
                        }
                        query += "id=" + encodeURIComponent(registry.id);
                        query += "&token=" + encodeURIComponent(registry.token);
                        fullUrl.search = query;
                        return [4 /*yield*/, this.transport.connect(channelId, fullUrl.toString())];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ChannelsClient.prototype.joinChannel = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.transport.sendControlMessageByChannel(request.channelId, 'join', request, function (message, err) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                var controlMessage = message.controlMessagePayload.jsonMessage;
                                var joinResponse = controlMessage.details;
                                _this.joinedChannels[request.channelId] = joinResponse;
                                _this.joinedChannelsByCode[joinResponse.channelCode] = joinResponse;
                                resolve(joinResponse);
                            }
                        });
                    })];
            });
        });
    };
    ChannelsClient.prototype.leaveChannel = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.transport.sendControlMessageByChannel(request.channelId, 'leave', request, function (message, err) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve();
                            }
                        });
                    })];
            });
        });
    };
    ChannelsClient.prototype.getHistory = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var channelId = request.channelId;
                        var joinInfo = _this.joinedChannels[channelId];
                        if (!joinInfo) {
                            reject(new Error("Trying to fetch history of an unjoined channel"));
                            return;
                        }
                        _this.transport.sendControlMessageByChannel(channelId, 'history', request, function (message, err) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                var controlMessage = message.controlMessagePayload.jsonMessage;
                                var historyResponse = controlMessage.details;
                                resolve(historyResponse);
                            }
                        });
                    })];
            });
        });
    };
    ;
    ChannelsClient.prototype.encode = function (data) {
        var text = (typeof data === "string") ? data : JSON.stringify(data);
        var payload = new TextEncoder().encode(text);
        return payload;
    };
    ChannelsClient.prototype.sendMessage = function (channelId, jsonPayload, binaryPayload, history, priority) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var joinInfo = _this.joinedChannels[channelId];
                        if (!joinInfo) {
                            reject(new Error("Trying to send message to an unjoined channel"));
                            return;
                        }
                        var messageInfo = {
                            channelCode: joinInfo.channelCode,
                            senderCode: joinInfo.participantCode,
                            history: history ? true : false,
                            priority: priority ? true : false,
                            jsonMessage: jsonPayload,
                            binaryPayload: binaryPayload
                        };
                        try {
                            _this.transport.send(channelId, messageInfo);
                            resolve(messageInfo);
                        }
                        catch (err) {
                            reject(err);
                        }
                    })];
            });
        });
    };
    return ChannelsClient;
}());
window.ChannelsClient = ChannelsClient;


/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var Rest = (function () {
    function Rest() {
    }
    Rest.get = function (url, headers) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var req = new XMLHttpRequest();
                        req.withCredentials = false;
                        req.open("GET", url);
                        if (headers) {
                            for (var key in headers) {
                                if (headers.hasOwnProperty(key)) {
                                    req.setRequestHeader(key, headers[key]);
                                }
                            }
                        }
                        req.onload = function (event) {
                            var status = req.status;
                            if (status === 0 || status >= 400) {
                                if (req.responseText) {
                                    Rest.onError(reject, status, req.responseText);
                                }
                                else {
                                    Rest.onError(reject, status, 'Request failed with code: ' + status);
                                }
                            }
                            else {
                                if (req.responseText) {
                                    var result = JSON.parse(req.responseText);
                                    resolve(result);
                                }
                                else {
                                    resolve(null);
                                }
                            }
                        };
                        req.onerror = function (err) {
                            Rest.onError(reject, 0, "There was a network error: " + err.message);
                        };
                        req.send();
                    })];
            });
        });
    };
    Rest.post = function (url, object, headers) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var req = new XMLHttpRequest();
                        req.withCredentials = false;
                        req.open("POST", url);
                        if (headers) {
                            for (var key in headers) {
                                if (headers.hasOwnProperty(key)) {
                                    req.setRequestHeader(key, headers[key]);
                                }
                            }
                        }
                        req.setRequestHeader("Content-Type", 'application/json');
                        req.onload = function (event) {
                            var status = req.status;
                            if (status === 0 || status >= 400) {
                                if (req.responseText) {
                                    Rest.onError(reject, status, req.responseText);
                                }
                                else {
                                    Rest.onError(reject, status, 'Request failed with code: ' + status);
                                }
                            }
                            else {
                                if (req.responseText) {
                                    var result = JSON.parse(req.responseText);
                                    resolve(result);
                                }
                                else {
                                    resolve(null);
                                }
                            }
                        };
                        req.onerror = function (err) {
                            Rest.onError(reject, 0, "There was a network error: " + err.message);
                        };
                        if (object) {
                            req.send(JSON.stringify(object));
                        }
                        else {
                            req.send();
                        }
                    })];
            });
        });
    };
    Rest.delete = function (url, headers) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        var req = new XMLHttpRequest();
                        req.withCredentials = false;
                        req.open("DELETE", url);
                        if (headers) {
                            for (var key in headers) {
                                if (headers.hasOwnProperty(key)) {
                                    req.setRequestHeader(key, headers[key]);
                                }
                            }
                        }
                        req.setRequestHeader("Content-Type", 'application/json');
                        req.onload = function (event) {
                            var status = req.status;
                            if (status === 0 || status >= 400) {
                                if (req.responseText) {
                                    Rest.onError(reject, status, req.responseText);
                                }
                                else {
                                    Rest.onError(reject, status, 'Request failed with code: ' + status);
                                }
                            }
                            else {
                                if (req.responseText) {
                                    var result = JSON.parse(req.responseText);
                                    resolve(result);
                                }
                                else {
                                    resolve(null);
                                }
                            }
                        };
                        req.onerror = function (err) {
                            Rest.onError(reject, 0, "There was a network error: " + err.message);
                        };
                        req.send();
                    })];
            });
        });
    };
    Rest.onError = function (reject, code, message) {
        reject({
            status: code,
            message: message
        });
    };
    return Rest;
}());
exports.Rest = Rest;


/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var DB_NAME = 'channels-db';
var DB_VERSION = 1;
var STORE_REGISTRIES = "registries";
var MODE_READWRITE = "readwrite";
var MODE_READ = "readonly";
var ClientDb = (function () {
    function ClientDb() {
    }
    ClientDb.prototype.open = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.db) {
                resolve();
                return;
            }
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = function (event) {
                console.error("Failed to load DB: ", event);
                reject(new Error("Error loading database: " + event));
            };
            request.onsuccess = function (event) {
                _this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = function (event) {
                var db = event.target.result;
                if (!event.oldVersion) {
                    var store = db.createObjectStore(STORE_REGISTRIES, { keyPath: "services.registrationUrl" });
                    store.createIndex("providerUrl", "services.providerUrl", { unique: true });
                }
            };
        });
    };
    ClientDb.prototype.getStore = function (name, mode) {
        var tx = this.db.transaction(name, mode);
        return tx.objectStore(name);
    };
    ClientDb.prototype.saveRegistry = function (registry) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var store = _this.getStore(STORE_REGISTRIES, MODE_READWRITE);
            try {
                var request = store.add(registry);
                request.onerror = function (event) {
                    reject(new Error("Error loading database: " + event));
                };
                request.onsuccess = function (event) {
                    resolve();
                };
            }
            catch (ex) {
                reject(ex);
            }
        });
    };
    ClientDb.prototype.getRegistry = function (registerUrl, providerUrl) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var store = _this.getStore(STORE_REGISTRIES, MODE_READ);
            var request;
            if (registerUrl) {
                request = store.get(registerUrl);
            }
            else if (providerUrl) {
                var index = store.index('providerUrl');
                request = index.get(providerUrl);
            }
            else {
                resolve(null);
                return;
            }
            request.onerror = function (event) {
                console.error("Failed to load registry from DB: ", event);
                reject(new Error("Failed to load registry: " + event));
            };
            request.onsuccess = function (event) {
                resolve(request.result);
            };
        });
    };
    ClientDb.prototype.getAllRegistries = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var store = _this.getStore(STORE_REGISTRIES, MODE_READ);
            var request = store.openCursor();
            var result = [];
            request.onerror = function (event) {
                console.error("Failed to open registry cursor: ", event);
                reject(new Error("Failed to open registry cursor: " + event));
            };
            request.onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    result.push(cursor.value);
                    cursor.continue();
                }
                else {
                    resolve(result);
                }
            };
        });
    };
    return ClientDb;
}());
exports.ClientDb = ClientDb;


/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


// This is free and unencumbered software released into the public domain.
// See LICENSE.md for more information.

//
// Utilities
//

/**
 * @param {number} a The number to test.
 * @param {number} min The minimum value in the range, inclusive.
 * @param {number} max The maximum value in the range, inclusive.
 * @return {boolean} True if a >= min and a <= max.
 */
function inRange(a, min, max) {
  return min <= a && a <= max;
}

/**
 * @param {*} o
 * @return {Object}
 */
function ToDictionary(o) {
  if (o === undefined) return {};
  if (o === Object(o)) return o;
  throw TypeError('Could not convert argument to dictionary');
}

/**
 * @param {string} string Input string of UTF-16 code units.
 * @return {!Array.<number>} Code points.
 */
function stringToCodePoints(string) {
  // https://heycam.github.io/webidl/#dfn-obtain-unicode

  // 1. Let S be the DOMString value.
  var s = String(string);

  // 2. Let n be the length of S.
  var n = s.length;

  // 3. Initialize i to 0.
  var i = 0;

  // 4. Initialize U to be an empty sequence of Unicode characters.
  var u = [];

  // 5. While i < n:
  while (i < n) {

    // 1. Let c be the code unit in S at index i.
    var c = s.charCodeAt(i);

    // 2. Depending on the value of c:

    // c < 0xD800 or c > 0xDFFF
    if (c < 0xD800 || c > 0xDFFF) {
      // Append to U the Unicode character with code point c.
      u.push(c);
    }

    // 0xDC00 ≤ c ≤ 0xDFFF
    else if (0xDC00 <= c && c <= 0xDFFF) {
      // Append to U a U+FFFD REPLACEMENT CHARACTER.
      u.push(0xFFFD);
    }

    // 0xD800 ≤ c ≤ 0xDBFF
    else if (0xD800 <= c && c <= 0xDBFF) {
      // 1. If i = n−1, then append to U a U+FFFD REPLACEMENT
      // CHARACTER.
      if (i === n - 1) {
        u.push(0xFFFD);
      }
      // 2. Otherwise, i < n−1:
      else {
        // 1. Let d be the code unit in S at index i+1.
        var d = string.charCodeAt(i + 1);

        // 2. If 0xDC00 ≤ d ≤ 0xDFFF, then:
        if (0xDC00 <= d && d <= 0xDFFF) {
          // 1. Let a be c & 0x3FF.
          var a = c & 0x3FF;

          // 2. Let b be d & 0x3FF.
          var b = d & 0x3FF;

          // 3. Append to U the Unicode character with code point
          // 2^16+2^10*a+b.
          u.push(0x10000 + (a << 10) + b);

          // 4. Set i to i+1.
          i += 1;
        }

        // 3. Otherwise, d < 0xDC00 or d > 0xDFFF. Append to U a
        // U+FFFD REPLACEMENT CHARACTER.
        else  {
          u.push(0xFFFD);
        }
      }
    }

    // 3. Set i to i+1.
    i += 1;
  }

  // 6. Return U.
  return u;
}

/**
 * @param {!Array.<number>} code_points Array of code points.
 * @return {string} string String of UTF-16 code units.
 */
function codePointsToString(code_points) {
  var s = '';
  for (var i = 0; i < code_points.length; ++i) {
    var cp = code_points[i];
    if (cp <= 0xFFFF) {
      s += String.fromCharCode(cp);
    } else {
      cp -= 0x10000;
      s += String.fromCharCode((cp >> 10) + 0xD800,
                               (cp & 0x3FF) + 0xDC00);
    }
  }
  return s;
}


//
// Implementation of Encoding specification
// https://encoding.spec.whatwg.org/
//

//
// 3. Terminology
//

/**
 * End-of-stream is a special token that signifies no more tokens
 * are in the stream.
 * @const
 */ var end_of_stream = -1;

/**
 * A stream represents an ordered sequence of tokens.
 *
 * @constructor
 * @param {!(Array.<number>|Uint8Array)} tokens Array of tokens that provide the
 * stream.
 */
function Stream(tokens) {
  /** @type {!Array.<number>} */
  this.tokens = [].slice.call(tokens);
}

Stream.prototype = {
  /**
   * @return {boolean} True if end-of-stream has been hit.
   */
  endOfStream: function() {
    return !this.tokens.length;
  },

  /**
   * When a token is read from a stream, the first token in the
   * stream must be returned and subsequently removed, and
   * end-of-stream must be returned otherwise.
   *
   * @return {number} Get the next token from the stream, or
   * end_of_stream.
   */
   read: function() {
    if (!this.tokens.length)
      return end_of_stream;
     return this.tokens.shift();
   },

  /**
   * When one or more tokens are prepended to a stream, those tokens
   * must be inserted, in given order, before the first token in the
   * stream.
   *
   * @param {(number|!Array.<number>)} token The token(s) to prepend to the stream.
   */
  prepend: function(token) {
    if (Array.isArray(token)) {
      var tokens = /**@type {!Array.<number>}*/(token);
      while (tokens.length)
        this.tokens.unshift(tokens.pop());
    } else {
      this.tokens.unshift(token);
    }
  },

  /**
   * When one or more tokens are pushed to a stream, those tokens
   * must be inserted, in given order, after the last token in the
   * stream.
   *
   * @param {(number|!Array.<number>)} token The tokens(s) to prepend to the stream.
   */
  push: function(token) {
    if (Array.isArray(token)) {
      var tokens = /**@type {!Array.<number>}*/(token);
      while (tokens.length)
        this.tokens.push(tokens.shift());
    } else {
      this.tokens.push(token);
    }
  }
};

//
// 4. Encodings
//

// 4.1 Encoders and decoders

/** @const */
var finished = -1;

/**
 * @param {boolean} fatal If true, decoding errors raise an exception.
 * @param {number=} opt_code_point Override the standard fallback code point.
 * @return {number} The code point to insert on a decoding error.
 */
function decoderError(fatal, opt_code_point) {
  if (fatal)
    throw TypeError('Decoder error');
  return opt_code_point || 0xFFFD;
}

//
// 7. API
//

/** @const */ var DEFAULT_ENCODING = 'utf-8';

// 7.1 Interface TextDecoder

/**
 * @constructor
 * @param {string=} encoding The label of the encoding;
 *     defaults to 'utf-8'.
 * @param {Object=} options
 */
function TextDecoder(encoding, options) {
  if (!(this instanceof TextDecoder)) {
    return new TextDecoder(encoding, options);
  }
  encoding = encoding !== undefined ? String(encoding).toLowerCase() : DEFAULT_ENCODING;
  if (encoding !== DEFAULT_ENCODING) {
    throw new Error('Encoding not supported. Only utf-8 is supported');
  }
  options = ToDictionary(options);

  /** @private @type {boolean} */
  this._streaming = false;
  /** @private @type {boolean} */
  this._BOMseen = false;
  /** @private @type {?Decoder} */
  this._decoder = null;
  /** @private @type {boolean} */
  this._fatal = Boolean(options['fatal']);
  /** @private @type {boolean} */
  this._ignoreBOM = Boolean(options['ignoreBOM']);

  Object.defineProperty(this, 'encoding', {value: 'utf-8'});
  Object.defineProperty(this, 'fatal', {value: this._fatal});
  Object.defineProperty(this, 'ignoreBOM', {value: this._ignoreBOM});
}

TextDecoder.prototype = {
  /**
   * @param {ArrayBufferView=} input The buffer of bytes to decode.
   * @param {Object=} options
   * @return {string} The decoded string.
   */
  decode: function decode(input, options) {
    var bytes;
    if (typeof input === 'object' && input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (typeof input === 'object' && 'buffer' in input &&
               input.buffer instanceof ArrayBuffer) {
      bytes = new Uint8Array(input.buffer,
                             input.byteOffset,
                             input.byteLength);
    } else {
      bytes = new Uint8Array(0);
    }

    options = ToDictionary(options);

    if (!this._streaming) {
      this._decoder = new UTF8Decoder({fatal: this._fatal});
      this._BOMseen = false;
    }
    this._streaming = Boolean(options['stream']);

    var input_stream = new Stream(bytes);

    var code_points = [];

    /** @type {?(number|!Array.<number>)} */
    var result;

    while (!input_stream.endOfStream()) {
      result = this._decoder.handler(input_stream, input_stream.read());
      if (result === finished)
        break;
      if (result === null)
        continue;
      if (Array.isArray(result))
        code_points.push.apply(code_points, /**@type {!Array.<number>}*/(result));
      else
        code_points.push(result);
    }
    if (!this._streaming) {
      do {
        result = this._decoder.handler(input_stream, input_stream.read());
        if (result === finished)
          break;
        if (result === null)
          continue;
        if (Array.isArray(result))
          code_points.push.apply(code_points, /**@type {!Array.<number>}*/(result));
        else
          code_points.push(result);
      } while (!input_stream.endOfStream());
      this._decoder = null;
    }

    if (code_points.length) {
      // If encoding is one of utf-8, utf-16be, and utf-16le, and
      // ignore BOM flag and BOM seen flag are unset, run these
      // subsubsteps:
      if (['utf-8'].indexOf(this.encoding) !== -1 &&
          !this._ignoreBOM && !this._BOMseen) {
        // If token is U+FEFF, set BOM seen flag.
        if (code_points[0] === 0xFEFF) {
          this._BOMseen = true;
          code_points.shift();
        } else {
          // Otherwise, if token is not end-of-stream, set BOM seen
          // flag and append token to output.
          this._BOMseen = true;
        }
      }
    }

    return codePointsToString(code_points);
  }
};

// 7.2 Interface TextEncoder

/**
 * @constructor
 * @param {string=} encoding The label of the encoding;
 *     defaults to 'utf-8'.
 * @param {Object=} options
 */
function TextEncoder(encoding, options) {
  if (!(this instanceof TextEncoder))
    return new TextEncoder(encoding, options);
  encoding = encoding !== undefined ? String(encoding).toLowerCase() : DEFAULT_ENCODING;
  if (encoding !== DEFAULT_ENCODING) {
    throw new Error('Encoding not supported. Only utf-8 is supported');
  }
  options = ToDictionary(options);

  /** @private @type {boolean} */
  this._streaming = false;
  /** @private @type {?Encoder} */
  this._encoder = null;
  /** @private @type {{fatal: boolean}} */
  this._options = {fatal: Boolean(options['fatal'])};

  Object.defineProperty(this, 'encoding', {value: 'utf-8'});
}

TextEncoder.prototype = {
  /**
   * @param {string=} opt_string The string to encode.
   * @param {Object=} options
   * @return {Uint8Array} Encoded bytes, as a Uint8Array.
   */
  encode: function encode(opt_string, options) {
    opt_string = opt_string ? String(opt_string) : '';
    options = ToDictionary(options);

    // NOTE: This option is nonstandard. None of the encodings
    // permitted for encoding (i.e. UTF-8, UTF-16) are stateful,
    // so streaming is not necessary.
    if (!this._streaming)
      this._encoder = new UTF8Encoder(this._options);
    this._streaming = Boolean(options['stream']);

    var bytes = [];
    var input_stream = new Stream(stringToCodePoints(opt_string));
    /** @type {?(number|!Array.<number>)} */
    var result;
    while (!input_stream.endOfStream()) {
      result = this._encoder.handler(input_stream, input_stream.read());
      if (result === finished)
        break;
      if (Array.isArray(result))
        bytes.push.apply(bytes, /**@type {!Array.<number>}*/(result));
      else
        bytes.push(result);
    }
    if (!this._streaming) {
      while (true) {
        result = this._encoder.handler(input_stream, input_stream.read());
        if (result === finished)
          break;
        if (Array.isArray(result))
          bytes.push.apply(bytes, /**@type {!Array.<number>}*/(result));
        else
          bytes.push(result);
      }
      this._encoder = null;
    }
    return new Uint8Array(bytes);
  }
};

//
// 8. The encoding
//

// 8.1 utf-8

/**
 * @constructor
 * @implements {Decoder}
 * @param {{fatal: boolean}} options
 */
function UTF8Decoder(options) {
  var fatal = options.fatal;

  // utf-8's decoder's has an associated utf-8 code point, utf-8
  // bytes seen, and utf-8 bytes needed (all initially 0), a utf-8
  // lower boundary (initially 0x80), and a utf-8 upper boundary
  // (initially 0xBF).
  var /** @type {number} */ utf8_code_point = 0,
      /** @type {number} */ utf8_bytes_seen = 0,
      /** @type {number} */ utf8_bytes_needed = 0,
      /** @type {number} */ utf8_lower_boundary = 0x80,
      /** @type {number} */ utf8_upper_boundary = 0xBF;

  /**
   * @param {Stream} stream The stream of bytes being decoded.
   * @param {number} bite The next byte read from the stream.
   * @return {?(number|!Array.<number>)} The next code point(s)
   *     decoded, or null if not enough data exists in the input
   *     stream to decode a complete code point.
   */
  this.handler = function(stream, bite) {
    // 1. If byte is end-of-stream and utf-8 bytes needed is not 0,
    // set utf-8 bytes needed to 0 and return error.
    if (bite === end_of_stream && utf8_bytes_needed !== 0) {
      utf8_bytes_needed = 0;
      return decoderError(fatal);
    }

    // 2. If byte is end-of-stream, return finished.
    if (bite === end_of_stream)
      return finished;

    // 3. If utf-8 bytes needed is 0, based on byte:
    if (utf8_bytes_needed === 0) {

      // 0x00 to 0x7F
      if (inRange(bite, 0x00, 0x7F)) {
        // Return a code point whose value is byte.
        return bite;
      }

      // 0xC2 to 0xDF
      if (inRange(bite, 0xC2, 0xDF)) {
        // Set utf-8 bytes needed to 1 and utf-8 code point to byte
        // − 0xC0.
        utf8_bytes_needed = 1;
        utf8_code_point = bite - 0xC0;
      }

      // 0xE0 to 0xEF
      else if (inRange(bite, 0xE0, 0xEF)) {
        // 1. If byte is 0xE0, set utf-8 lower boundary to 0xA0.
        if (bite === 0xE0)
          utf8_lower_boundary = 0xA0;
        // 2. If byte is 0xED, set utf-8 upper boundary to 0x9F.
        if (bite === 0xED)
          utf8_upper_boundary = 0x9F;
        // 3. Set utf-8 bytes needed to 2 and utf-8 code point to
        // byte − 0xE0.
        utf8_bytes_needed = 2;
        utf8_code_point = bite - 0xE0;
      }

      // 0xF0 to 0xF4
      else if (inRange(bite, 0xF0, 0xF4)) {
        // 1. If byte is 0xF0, set utf-8 lower boundary to 0x90.
        if (bite === 0xF0)
          utf8_lower_boundary = 0x90;
        // 2. If byte is 0xF4, set utf-8 upper boundary to 0x8F.
        if (bite === 0xF4)
          utf8_upper_boundary = 0x8F;
        // 3. Set utf-8 bytes needed to 3 and utf-8 code point to
        // byte − 0xF0.
        utf8_bytes_needed = 3;
        utf8_code_point = bite - 0xF0;
      }

      // Otherwise
      else {
        // Return error.
        return decoderError(fatal);
      }

      // Then (byte is in the range 0xC2 to 0xF4) set utf-8 code
      // point to utf-8 code point << (6 × utf-8 bytes needed) and
      // return continue.
      utf8_code_point = utf8_code_point << (6 * utf8_bytes_needed);
      return null;
    }

    // 4. If byte is not in the range utf-8 lower boundary to utf-8
    // upper boundary, run these substeps:
    if (!inRange(bite, utf8_lower_boundary, utf8_upper_boundary)) {

      // 1. Set utf-8 code point, utf-8 bytes needed, and utf-8
      // bytes seen to 0, set utf-8 lower boundary to 0x80, and set
      // utf-8 upper boundary to 0xBF.
      utf8_code_point = utf8_bytes_needed = utf8_bytes_seen = 0;
      utf8_lower_boundary = 0x80;
      utf8_upper_boundary = 0xBF;

      // 2. Prepend byte to stream.
      stream.prepend(bite);

      // 3. Return error.
      return decoderError(fatal);
    }

    // 5. Set utf-8 lower boundary to 0x80 and utf-8 upper boundary
    // to 0xBF.
    utf8_lower_boundary = 0x80;
    utf8_upper_boundary = 0xBF;

    // 6. Increase utf-8 bytes seen by one and set utf-8 code point
    // to utf-8 code point + (byte − 0x80) << (6 × (utf-8 bytes
    // needed − utf-8 bytes seen)).
    utf8_bytes_seen += 1;
    utf8_code_point += (bite - 0x80) << (6 * (utf8_bytes_needed - utf8_bytes_seen));

    // 7. If utf-8 bytes seen is not equal to utf-8 bytes needed,
    // continue.
    if (utf8_bytes_seen !== utf8_bytes_needed)
      return null;

    // 8. Let code point be utf-8 code point.
    var code_point = utf8_code_point;

    // 9. Set utf-8 code point, utf-8 bytes needed, and utf-8 bytes
    // seen to 0.
    utf8_code_point = utf8_bytes_needed = utf8_bytes_seen = 0;

    // 10. Return a code point whose value is code point.
    return code_point;
  };
}

/**
 * @constructor
 * @implements {Encoder}
 * @param {{fatal: boolean}} options
 */
function UTF8Encoder(options) {
  var fatal = options.fatal;
  /**
   * @param {Stream} stream Input stream.
   * @param {number} code_point Next code point read from the stream.
   * @return {(number|!Array.<number>)} Byte(s) to emit.
   */
  this.handler = function(stream, code_point) {
    // 1. If code point is end-of-stream, return finished.
    if (code_point === end_of_stream)
      return finished;

    // 2. If code point is in the range U+0000 to U+007F, return a
    // byte whose value is code point.
    if (inRange(code_point, 0x0000, 0x007f))
      return code_point;

    // 3. Set count and offset based on the range code point is in:
    var count, offset;
    // U+0080 to U+07FF:    1 and 0xC0
    if (inRange(code_point, 0x0080, 0x07FF)) {
      count = 1;
      offset = 0xC0;
    }
    // U+0800 to U+FFFF:    2 and 0xE0
    else if (inRange(code_point, 0x0800, 0xFFFF)) {
      count = 2;
      offset = 0xE0;
    }
    // U+10000 to U+10FFFF: 3 and 0xF0
    else if (inRange(code_point, 0x10000, 0x10FFFF)) {
      count = 3;
      offset = 0xF0;
    }

    // 4.Let bytes be a byte sequence whose first byte is (code
    // point >> (6 × count)) + offset.
    var bytes = [(code_point >> (6 * count)) + offset];

    // 5. Run these substeps while count is greater than 0:
    while (count > 0) {

      // 1. Set temp to code point >> (6 × (count − 1)).
      var temp = code_point >> (6 * (count - 1));

      // 2. Append to bytes 0x80 | (temp & 0x3F).
      bytes.push(0x80 | (temp & 0x3F));

      // 3. Decrease count by one.
      count -= 1;
    }

    // 6. Return bytes bytes, in order.
    return bytes;
  };
}

exports.TextEncoder = TextEncoder;
exports.TextDecoder = TextDecoder;

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = __webpack_require__(0);
var TransportManager = (function () {
    function TransportManager() {
        this.counters = {};
        this.sockets = {};
        this.socketsById = {};
        this.controlCallbacks = {};
    }
    TransportManager.prototype.connect = function (channelId, url) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var info = _this.sockets[url];
            if (info) {
                _this.socketsById[channelId] = info;
                if (info.connected) {
                    resolve();
                    return;
                }
                if (info.connecting) {
                    info.pendingCallbacks.push(function (err) {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                    return;
                }
            }
            if (!info) {
                info = {
                    url: url,
                    connected: false,
                    connecting: true,
                    pendingCallbacks: []
                };
                _this.sockets[url] = info;
                _this.socketsById[channelId] = info;
            }
            else {
                info.connecting = true;
                info.pendingCallbacks = [];
            }
            info.pendingCallbacks.push(function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
            _this.connectSocket(info);
        });
    };
    TransportManager.prototype.connectSocket = function (info) {
        var _this = this;
        info.connecting = true;
        try {
            var socket_1 = new WebSocket(info.url);
            socket_1.binaryType = "arraybuffer";
            info.socket = socket_1;
            socket_1.onopen = function (event) {
                if (socket_1.readyState === WebSocket.OPEN) {
                    info.connecting = false;
                    info.connected = true;
                    try {
                        for (var _i = 0, _a = info.pendingCallbacks; _i < _a.length; _i++) {
                            var cb = _a[_i];
                            cb();
                        }
                    }
                    catch (err) {
                        // noop
                    }
                }
            };
            socket_1.onerror = function (error) {
                try {
                    for (var _i = 0, _a = info.pendingCallbacks; _i < _a.length; _i++) {
                        var cb = _a[_i];
                        cb(error);
                    }
                }
                catch (err) {
                    // noop
                }
                finally {
                    info.connected = false;
                    info.connecting = false;
                    info.pendingCallbacks = [];
                }
            };
            socket_1.onclose = function (event) {
                info.connected = false;
                info.connecting = false;
            };
            socket_1.onmessage = function (event) {
                _this.onMessageReceived(info, event);
            };
        }
        catch (err) {
            try {
                for (var _i = 0, _a = info.pendingCallbacks; _i < _a.length; _i++) {
                    var cb = _a[_i];
                    cb(err);
                }
            }
            catch (err) {
                // noop
            }
            finally {
                info.connected = false;
                info.connecting = false;
                info.pendingCallbacks = [];
            }
        }
    };
    TransportManager.prototype.onMessageReceived = function (info, event) {
        var data = event.data;
        if (data) {
            var buffer = event.data;
            var parsed = utils_1.ChannelMessageUtils.parseChannelMessage(new Uint8Array(buffer));
            if (parsed && parsed.valid && parsed.contents) {
                this.handleMessage(info, parsed.contents);
            }
            else {
                console.warn("Failed to parse message: ", parsed ? parsed.errorMessage : "null");
            }
            return;
        }
    };
    TransportManager.prototype.handleMessage = function (info, message) {
        // handle control message
        if (message.channelCode === 0 && message.controlMessagePayload) {
            var controlMessage = message.controlMessagePayload.jsonMessage;
            var handled = false;
            if (controlMessage.requestId) {
                // the client wants to handle the  message
                if (this.controlCallbacks[controlMessage.requestId]) {
                    var cb = this.controlCallbacks[controlMessage.requestId];
                    try {
                        cb(message);
                    }
                    catch (err) { }
                    finally {
                        handled = true;
                        delete this.controlCallbacks[controlMessage.requestId];
                    }
                }
            }
            if (!handled) {
                // This library will try to handle the message or fire the appropriate events
                switch (controlMessage.type) {
                    case 'ping':
                        this.sendControlMessage(info.url, 'ping-reply', {}, controlMessage.requestId);
                        break;
                    case 'history-message': {
                        if (this.historyMessageHandler) {
                            var binaryMessage = message.controlMessagePayload.binaryPortion;
                            var parsedMessage = utils_1.ChannelMessageUtils.parseChannelMessage(binaryMessage);
                            if (parsedMessage && parsedMessage.valid) {
                                var historyMessageInfo = parsedMessage.contents;
                                try {
                                    this.historyMessageHandler(message.controlMessagePayload.jsonMessage.details, historyMessageInfo);
                                }
                                catch (ex) { }
                            }
                            else {
                                console.warn("Ignoring history message: Failed to parse.", parsedMessage ? parsedMessage.errorMessage : "");
                            }
                        }
                        break;
                    }
                    default:
                        if (this.controlMessageHandler) {
                            try {
                                this.controlMessageHandler(message);
                            }
                            catch (ex) { }
                        }
                        break;
                }
            }
        }
        else {
            // Not a control message
            if (this.channelMessageHandler) {
                try {
                    this.channelMessageHandler(message);
                }
                catch (ex) { }
            }
            else {
                console.log("Channel message received", message);
            }
        }
    };
    TransportManager.prototype.sendControlMessage = function (transportUrl, type, details, messageId, callback) {
        var info = this.sockets[transportUrl];
        this.sendControl(messageId || this.createId("general"), info, type, details, callback);
    };
    TransportManager.prototype.sendControlMessageByChannel = function (channelId, type, details, callback) {
        var info = this.socketsById[channelId];
        this.sendControl(this.createId(channelId), info, type, details, callback);
    };
    TransportManager.prototype.createId = function (root) {
        if (!this.counters[root]) {
            this.counters[root] = 0;
        }
        this.counters[root]++;
        return root + "-" + this.counters[root];
    };
    TransportManager.prototype.sendControl = function (messageId, info, type, details, callback) {
        if (info && info.connected) {
            if (callback) {
                this.controlCallbacks[messageId] = callback;
            }
            var bytes = utils_1.ChannelMessageUtils.serializeControlMessage(messageId, type, details);
            info.socket.send(bytes.buffer);
        }
        else if (callback) {
            callback(null, new Error("Socket not connected to this destination"));
        }
    };
    TransportManager.prototype.send = function (channelId, message) {
        var info = this.socketsById[channelId];
        if (info && info.connected) {
            var bytes = utils_1.ChannelMessageUtils.serializeChannelMessage(message, 0, 0);
            info.socket.send(bytes.buffer);
        }
        else {
            throw new Error("Socket not connected to this channel");
        }
    };
    return TransportManager;
}());
exports.TransportManager = TransportManager;


/***/ })
/******/ ]);