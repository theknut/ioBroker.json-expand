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
var import_json_bigint = __toESM(require("json-bigint"));
class Json2iob {
  constructor(adapter) {
    if (!adapter) {
      throw new Error("ioBroker Adapter is not defined!");
    }
    this.adapter = adapter;
    this.alreadyCreatedObjects = {};
    this.objectTypes = {};
    this.forbiddenCharsRegex = /[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+/gu;
    if (this.adapter && this.adapter.FORBIDDEN_CHARS) {
      this.forbiddenCharsRegex = this.adapter.FORBIDDEN_CHARS;
    }
  }
  async parse(path, element, options = { write: false }) {
    try {
      if (element === null || element === void 0) {
        this.adapter.log.debug("Cannot extract empty: " + path);
        return;
      }
      if (options.parseBase64 && this._isBase64(element) || options.parseBase64byIds && options.parseBase64byIds.includes(path)) {
        try {
          element = Buffer.from(element, "base64").toString("utf8");
          if (this._isJsonString(element)) {
            element = import_json_bigint.default.parse(element);
          }
        } catch (error) {
          this.adapter.log.warn(`Cannot parse base64 for ${path}: ${error}`);
        }
      }
      const objectKeys = Object.keys(element);
      if (!options || !options.write) {
        if (!options) {
          options = { write: false };
        } else {
          options["write"] = false;
        }
      }
      path = path.toString().replace(this.forbiddenCharsRegex, "_");
      if (typeof element === "string" || typeof element === "number") {
        if (path.endsWith(".")) {
          path = path.slice(0, -1);
        }
        const lastPathElement = path.split(".").pop();
        if (options.excludeStateWithEnding && lastPathElement) {
          for (const excludeEnding of options.excludeStateWithEnding) {
            if (lastPathElement.endsWith(excludeEnding)) {
              this.adapter.log.debug(`skip state with ending : ${path}`);
              return;
            }
          }
        }
        if (options.makeStateWritableWithEnding && lastPathElement) {
          for (const writingEnding of options.makeStateWritableWithEnding) {
            if (lastPathElement.toLowerCase().endsWith(writingEnding)) {
              this.adapter.log.debug(`make state with ending writable : ${path}`);
              options.write = true;
            }
          }
        }
        if (!this.alreadyCreatedObjects[path] || this.objectTypes[path] !== typeof element) {
          let type = element !== null ? typeof element : "mixed";
          if (this.objectTypes[path] && this.objectTypes[path] !== typeof element) {
            type = "mixed";
            this.adapter.log.debug(`Type changed for ${path} from ${this.objectTypes[path]} to ${type}`);
          }
          let states;
          if (options.states && options.states[path]) {
            states = options.states[path];
            if (!states[element]) {
              states[element] = element;
            }
          }
          const common = {
            name: lastPathElement,
            role: this._getRole(element, options.write || false),
            type,
            write: options.write,
            read: true,
            states
          };
          if (options.units && options.units[path]) {
            common.unit = options.units[path];
          }
          await this._createState(path, common, options);
        }
        await this.adapter.setStateAsync(path, element, true);
        return;
      }
      if (options.removePasswords && path.toString().toLowerCase().includes("password")) {
        this.adapter.log.debug(`skip password : ${path}`);
        return;
      }
      if (!this.alreadyCreatedObjects[path] || options.deleteBeforeUpdate) {
        if (options.excludeStateWithEnding) {
          for (const excludeEnding of options.excludeStateWithEnding) {
            if (path.endsWith(excludeEnding)) {
              this.adapter.log.debug(`skip state with ending : ${path}`);
              return;
            }
          }
        }
        if (options.makeStateWritableWithEnding) {
          for (const writingEnding of options.makeStateWritableWithEnding) {
            if (path.toLowerCase().endsWith(writingEnding)) {
              this.adapter.log.debug(`make state with ending writable : ${path}`);
              options.write = true;
            }
          }
        }
        if (options.deleteBeforeUpdate) {
          this.adapter.log.debug(`Deleting ${path} before update`);
          for (const key in this.alreadyCreatedObjects) {
            if (key.startsWith(path)) {
              delete this.alreadyCreatedObjects[key];
            }
          }
          await this.adapter.delObjectAsync(path, { recursive: true });
        }
        let name = options.channelName || "";
        if (options.preferedArrayDesc && element[options.preferedArrayDesc]) {
          name = element[options.preferedArrayDesc];
        }
        await this.adapter.setObjectNotExistsAsync(path, {
          type: "channel",
          common: {
            name,
            write: false,
            read: true
          },
          native: {}
        }).then(() => {
          if (!options.dontSaveCreatedObjects) {
            this.alreadyCreatedObjects[path] = true;
          }
          options.channelName = void 0;
          options.deleteBeforeUpdate = void 0;
        }).catch((error) => {
          this.adapter.log.error(error);
        });
      }
      if (Array.isArray(element)) {
        await this._extractArray(element, "", path, options);
        return;
      }
      for (const key of objectKeys) {
        if (key.toLowerCase().includes("password") && options.removePasswords) {
          this.adapter.log.debug(`skip password : ${path}.${key}`);
          return;
        }
        if (typeof element[key] === "function") {
          this.adapter.log.debug("Skip function: " + path + "." + key);
          continue;
        }
        if (element[key] == null) {
          element[key] = "";
        }
        if (this._isJsonString(element[key]) && options.autoCast) {
          element[key] = import_json_bigint.default.parse(element[key]);
        }
        if (options.parseBase64 && this._isBase64(element[key]) || options.parseBase64byIds && options.parseBase64byIds.includes(key)) {
          try {
            element[key] = Buffer.from(element[key], "base64").toString("utf8");
            if (this._isJsonString(element[key])) {
              element[key] = import_json_bigint.default.parse(element[key]);
            }
          } catch (error) {
            this.adapter.log.warn(`Cannot parse base64 for ${path + "." + key}: ${error}`);
          }
        }
        if (Array.isArray(element[key])) {
          await this._extractArray(element, key, path, options);
        } else if (element[key] !== null && typeof element[key] === "object") {
          await this.parse(path + "." + key, element[key], options);
        } else {
          const pathKey = key.replace(/\./g, "_");
          if (!this.alreadyCreatedObjects[path + "." + pathKey] || this.objectTypes[path + "." + pathKey] !== typeof element[key]) {
            let objectName = key;
            if (options.descriptions && options.descriptions[key]) {
              objectName = options.descriptions[key];
            }
            let type = element[key] !== null ? typeof element[key] : "mixed";
            if (this.objectTypes[path + "." + pathKey] && this.objectTypes[path + "." + pathKey] !== typeof element[key]) {
              type = "mixed";
              this.adapter.log.debug(
                `Type changed for ${path + "." + pathKey} from ${this.objectTypes[path + "." + pathKey]} to ${type}`
              );
            }
            let states;
            if (options.states && options.states[key]) {
              states = options.states[key];
              if (!states[element[key]]) {
                states[element[key]] = element[key];
              }
            }
            const common = {
              name: objectName,
              role: this._getRole(element[key], options.write || false),
              type,
              write: options.write,
              read: true,
              states
            };
            if (options.units && options.units[key]) {
              common.unit = options.units[key];
            }
            await this._createState(path + "." + pathKey, common, options);
          }
          await this.adapter.setStateAsync(path + "." + pathKey, element[key], true);
        }
      }
    } catch (error) {
      this.adapter.log.error("Error extract keys: " + path + " " + JSON.stringify(element));
      this.adapter.log.error(error);
    }
  }
  async _createState(path, common, options = {}) {
    await this.adapter.extendObjectAsync(path, {
      type: "state",
      common,
      native: {}
    }).then(() => {
      if (!options.dontSaveCreatedObjects) {
        this.alreadyCreatedObjects[path] = true;
      }
      this.objectTypes[path] = common.type;
    }).catch((error) => {
      this.adapter.log.error(error);
    });
  }
  async _extractArray(element, key, path, options) {
    try {
      if (key) {
        element = element[key];
      }
      for (let index in element) {
        let arrayElement = element[index];
        if (arrayElement == null) {
          this.adapter.log.debug("Cannot extract empty: " + path + "." + key + "." + index);
          continue;
        }
        const indexNumber = parseInt(index) + 1;
        index = indexNumber.toString();
        if (indexNumber < 10) {
          index = "0" + index;
        }
        if (options.autoCast && typeof arrayElement === "string" && this._isJsonString(arrayElement)) {
          try {
            element[index] = import_json_bigint.default.parse(arrayElement);
            arrayElement = element[index];
          } catch (error) {
            this.adapter.log.warn(
              `Cannot parse json value for ${path + "." + key + "." + index}: ${error}`
            );
          }
        }
        let arrayPath = key + index;
        if (typeof arrayElement === "string" && key !== "") {
          await this.parse(path + "." + key + "." + arrayElement, arrayElement, options);
          continue;
        }
        if (typeof arrayElement[Object.keys(arrayElement)[0]] === "string") {
          arrayPath = arrayElement[Object.keys(arrayElement)[0]];
        }
        for (const keyName of Object.keys(arrayElement)) {
          if (keyName.endsWith("Id") && arrayElement[keyName] !== null) {
            if (arrayElement[keyName] && arrayElement[keyName].replace) {
              arrayPath = arrayElement[keyName].replace(/\./g, "");
            } else {
              arrayPath = arrayElement[keyName];
            }
          }
        }
        for (const keyName in Object.keys(arrayElement)) {
          if (keyName.endsWith("Name")) {
            if (arrayElement[keyName] && arrayElement[keyName].replace) {
              arrayPath = arrayElement[keyName].replace(/\./g, "");
            } else {
              arrayPath = arrayElement[keyName];
            }
          }
        }
        if (arrayElement.id) {
          if (arrayElement.id.replace) {
            arrayPath = arrayElement.id.replace(/\./g, "");
          } else {
            arrayPath = arrayElement.id;
          }
        }
        if (arrayElement.name) {
          arrayPath = arrayElement.name.replace(/\./g, "");
        }
        if (arrayElement.label) {
          arrayPath = arrayElement.label.replace(/\./g, "");
        }
        if (arrayElement.labelText) {
          arrayPath = arrayElement.labelText.replace(/\./g, "");
        }
        if (arrayElement.start_date_time) {
          arrayPath = arrayElement.start_date_time.replace(/\./g, "");
        }
        if (options.preferedArrayName && options.preferedArrayName.indexOf("+") !== -1) {
          const preferedArrayNameArray = options.preferedArrayName.split("+");
          if (arrayElement[preferedArrayNameArray[0]] !== void 0) {
            const element0 = arrayElement[preferedArrayNameArray[0]].toString().replace(/\./g, "").replace(/ /g, "");
            let element1 = "";
            if (preferedArrayNameArray[1].indexOf("/") !== -1) {
              const subArray = preferedArrayNameArray[1].split("/");
              const subElement = arrayElement[subArray[0]];
              if (subElement && subElement[subArray[1]] !== void 0) {
                element1 = subElement[subArray[1]];
              } else if (arrayElement[subArray[1]] !== void 0) {
                element1 = arrayElement[subArray[1]];
              }
            } else {
              element1 = arrayElement[preferedArrayNameArray[1]].toString().replace(/\./g, "").replace(/ /g, "");
            }
            arrayPath = element0 + "-" + element1;
          }
        } else if (options.preferedArrayName && options.preferedArrayName.indexOf("/") !== -1) {
          const preferedArrayNameArray = options.preferedArrayName.split("/");
          const subElement = arrayElement[preferedArrayNameArray[0]];
          if (subElement) {
            arrayPath = subElement[preferedArrayNameArray[1]].toString().replace(/\./g, "").replace(/ /g, "");
          }
        } else if (options.preferedArrayName && arrayElement[options.preferedArrayName]) {
          arrayPath = arrayElement[options.preferedArrayName].toString().replace(/\./g, "");
        }
        if (options.forceIndex) {
          arrayPath = key + index;
        }
        if (!options.forceIndex && Object.keys(arrayElement).length === 2 && typeof Object.keys(arrayElement)[0] === "string" && typeof Object.keys(arrayElement)[1] === "string" && typeof arrayElement[Object.keys(arrayElement)[0]] !== "object" && typeof arrayElement[Object.keys(arrayElement)[1]] !== "object" && arrayElement[Object.keys(arrayElement)[0]] !== "null") {
          let subKey = arrayElement[Object.keys(arrayElement)[0]];
          let subValue = arrayElement[Object.keys(arrayElement)[1]];
          if (options.parseBase64 && this._isBase64(subValue) || options.parseBase64byIds && options.parseBase64byIds.includes(subKey)) {
            try {
              subValue = Buffer.from(subValue, "base64").toString("utf8");
              if (this._isJsonString(subValue)) {
                subValue = import_json_bigint.default.parse(subValue);
              }
            } catch (error) {
              this.adapter.log.warn(
                `Cannot parse base64 value ${subValue} for ${path + "." + subKey}: ${error}`
              );
            }
          }
          const subName = Object.keys(arrayElement)[0] + " " + Object.keys(arrayElement)[1];
          if (key) {
            subKey = key + "." + subKey;
          }
          if (!this.alreadyCreatedObjects[path + "." + subKey] || this.objectTypes[path + "." + subKey] !== typeof subValue) {
            let type = subValue !== null ? typeof subValue : "mixed";
            if (this.objectTypes[path + "." + subKey] && this.objectTypes[path + "." + subKey] !== typeof subValue) {
              this.adapter.log.debug(
                `Type of ${path + "." + subKey} changed from ${this.objectTypes[path + "." + subKey]} to ${typeof subValue}!`
              );
              type = "mixed";
            }
            let states;
            if (options.states && options.states[subKey]) {
              states = options.states[subKey];
              if (!states[subValue]) {
                states[subValue] = subValue;
              }
            }
            const common = {
              name: subName,
              role: this._getRole(subValue, options.write || false),
              type,
              write: options.write,
              read: true,
              states
            };
            if (options.units && options.units[subKey]) {
              common.unit = options.units[subKey];
            }
            await this._createState(path + "." + subKey, common, options);
          }
          await this.adapter.setStateAsync(path + "." + subKey, subValue, true);
          continue;
        }
        await this.parse(path + "." + arrayPath, arrayElement, options);
      }
    } catch (error) {
      this.adapter.log.error("Cannot extract array " + path);
      this.adapter.log.error(error);
    }
  }
  _isBase64(str) {
    if (!str || typeof str !== "string") {
      return false;
    }
    const base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))/;
    return base64regex.test(str);
  }
  _isJsonString(str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }
  _getRole(element, write) {
    if (typeof element === "boolean" && !write) {
      return "indicator";
    }
    if (typeof element === "boolean" && write) {
      return "switch";
    }
    if (typeof element === "number" && !write) {
      if (element && element.toString().length === 13) {
        if (element > 15e11 && element < 2e12) {
          return "value.time";
        }
      }
      return "value";
    }
    if (typeof element === "number" && write) {
      return "level";
    }
    if (typeof element === "string") {
      return "text";
    }
    return "state";
  }
}
module.exports = Json2iob;
//# sourceMappingURL=json2iob.js.map
