"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_json2iob = __toESM(require("./lib/json2iob"));
class JsonExpand extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "json-expand"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("objectChange", this.onObjectChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.json2iob = new import_json2iob.default(this);
    this.subscribedStates = new Array();
    this.setStateAsync = this.overrideSetStateAsync;
    this.extendObjectAsync = this.overrideExtendObjectAsync;
    this.setObjectNotExistsAsync = this.overrideSetObjectNotExistsAsync;
    this.delObjectAsync = this.overrideDelObjectAsync;
  }
  async overrideSetStateAsync(id, state, ack) {
    this.log.silly(`setForeignStateAsync(${id}, ${JSON.stringify(state)}, ${ack})`);
    return await this.setForeignStateAsync(id, state, ack);
  }
  async overrideExtendObjectAsync(id, objPart, options) {
    this.log.silly(`extendForeignObjectAsync(${id}, ${JSON.stringify(objPart)}, ${JSON.stringify(options)})`);
    return await this.extendForeignObjectAsync(id, objPart, options);
  }
  async overrideSetObjectNotExistsAsync(id, obj) {
    this.log.silly(`setForeignObjectNotExistsAsync(${id}, ${JSON.stringify(obj)})`);
    return await this.setForeignObjectNotExistsAsync(id, obj);
  }
  async overrideDelObjectAsync(id, options) {
    this.log.silly(`delForeignObjectAsync(${id}, ${JSON.stringify(options)})`);
    await this.delForeignObjectAsync(id, options);
  }
  async onReady() {
    this.log.debug(`Booting '${this.name}'...`);
    await this.subscribeForeignObjectsAsync("*");
    await this.subscribeStatesWithCustomEnabled(this.subscribedStates);
    this.log.debug(`Booting '${this.name}' finished`);
  }
  async subscribeStatesWithCustomEnabled(subscribedStates) {
    const view = await this.getObjectViewAsync("system", "custom", {});
    for (const row in view.rows) {
      const id = view.rows[row].id;
      await this.handleSubscribeStateAsync(id, subscribedStates);
    }
  }
  onUnload(callback) {
    try {
      callback();
    } catch (e) {
      callback();
    }
  }
  async onObjectChange(id, obj) {
    const customObject = this.getCustomObject(obj);
    await this.handleOnObjectChangeAsync(id, customObject, this.subscribedStates);
  }
  getCustomObject(obj) {
    var _a, _b;
    return (_b = (_a = obj == null ? void 0 : obj.common) == null ? void 0 : _a.custom) == null ? void 0 : _b[this.namespace];
  }
  async handleOnObjectChangeAsync(id, options, subscribedStates) {
    if (options === void 0 && subscribedStates.includes(id)) {
      this.log.info(`Disabled expansion of state '${id}'`);
      await this.handleUnsubscribeStateAsync(id, subscribedStates);
    } else if (options !== void 0) {
      this.log.info(`Enabled expansion of state '${id}'`);
      if ((options == null ? void 0 : options.expandNow) == true) {
        const state = await this.getForeignStateAsync(id);
        this.log.debug("Expand " + (state == null ? void 0 : state.val));
        await this.expandValueAsync(state == null ? void 0 : state.val, options);
      }
      await this.handleSubscribeStateAsync(id, subscribedStates);
    }
  }
  async handleSubscribeStateAsync(id, subscribedStates) {
    if (subscribedStates.includes(id)) {
      this.log.debug(`Already subscribed to '${id}' state changes`);
      return true;
    }
    this.log.debug(`Subscribe to '${id}' state changes`);
    await this.subscribeForeignStatesAsync(id);
    subscribedStates.push(id);
    if (this.log.level == "debug") {
      this.log.debug(`handleSubscribeStateAsync subscribedStates: ${JSON.stringify(subscribedStates)}`);
    }
    return true;
  }
  async handleUnsubscribeStateAsync(id, subscribedStates) {
    if (!subscribedStates.includes(id)) {
      this.log.debug(`Not subscribed to '${id}' state changes`);
      return true;
    }
    this.log.debug(`Unsubscribe from '${id}' state changes`);
    await this.unsubscribeForeignStatesAsync(id);
    subscribedStates.splice(
      subscribedStates.findIndex((item) => item == id),
      1
    );
    if (this.log.level == "debug") {
      this.log.debug(`handleUnsubscribeStateAsync subscribedStates: ${JSON.stringify(subscribedStates)}`);
    }
    return true;
  }
  async expandValueAsync(value, options) {
    const json = this.maybeConvert(value);
    this.log.debug(`Expanding into state '${options.rootObjectId}.${options.channelName}'`);
    this.setForeignObjectNotExistsAsync(`${options.rootObjectId}.${options.channelName}`, {
      type: "channel",
      common: {
        name: options.channelName || ""
      },
      native: {}
    });
    await this.json2iob.parse(options.rootObjectId + "." + options.channelName, json, options);
  }
  maybeConvert(value) {
    if (value === void 0 || value == null) {
      return void 0;
    }
    if (typeof value === "object") {
      return value;
    } else if (value[0] === "{" && value[value.length - 1] === "}" || value[0] === "[" && value[value.length - 1] === "]") {
      return JSON.parse(value);
    }
    return value;
  }
  async onStateChange(id, state) {
    await this.handleOnStateChangeAsync(id, state == null ? void 0 : state.val);
  }
  async handleOnStateChangeAsync(id, value) {
    if (!value) {
      return;
    }
    const customObject = this.getCustomObject(await this.getForeignObjectAsync(id));
    if (!customObject) {
      return;
    }
    await this.expandValueAsync(value, customObject);
  }
}
if (require.main !== module) {
  module.exports = (options) => new JsonExpand(options);
} else {
  (() => new JsonExpand())();
}
//# sourceMappingURL=main.js.map
