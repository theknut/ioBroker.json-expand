/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import Json2iob from "json2iob";

type customOptions = {
    rootObjectId: string; // root object id where the state should be expanded into
    channelName?: string; //set name of the root channel
    expandNow: boolean;
};

class JsonExpand extends utils.Adapter {
    json2iob: any;
    subscribedStates: Array<string>;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "json-expand",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("objectChange", this.onObjectChange.bind(this));
        this.on("unload", this.onUnload.bind(this));

        this.json2iob = new Json2iob(this);
        this.subscribedStates = new Array<string>();

        /*
            override functions which are used by json2iob
            and replace them by functions used for foreign states
        */
        this.setStateAsync = this.overrideSetStateAsync;
        this.extendObjectAsync = this.overrideExtendObjectAsync;
        this.setObjectNotExistsAsync = this.overrideSetObjectNotExistsAsync;
        this.delObjectAsync = this.overrideDelObjectAsync;
    }

    private async overrideSetStateAsync(
        id: string,
        state: ioBroker.State | ioBroker.StateValue | ioBroker.SettableState,
        ack?: boolean,
    ): ioBroker.SetStatePromise {
        this.log.silly(`setForeignStateAsync(${id}, ${JSON.stringify(state)}, ${ack})`);
        return await this.setForeignStateAsync(id, state, ack);
    }

    private async overrideExtendObjectAsync(
        id: string,
        objPart: ioBroker.PartialObject,
        options?: ioBroker.ExtendObjectOptions,
    ): ioBroker.SetObjectPromise {
        this.log.silly(`extendForeignObjectAsync(${id}, ${JSON.stringify(objPart)}, ${JSON.stringify(options)})`);
        return await this.extendForeignObjectAsync(id, objPart, options);
    }

    private async overrideSetObjectNotExistsAsync<T extends string>(
        id: T,
        obj: ioBroker.SettableObject<ioBroker.ObjectIdToObjectType<T, "write">>,
    ): ioBroker.SetObjectPromise {
        this.log.silly(`setForeignObjectNotExistsAsync(${id}, ${JSON.stringify(obj)})`);
        return await this.setForeignObjectNotExistsAsync(id, obj);
    }

    private async overrideDelObjectAsync(id: string, options?: ioBroker.DelObjectOptions): Promise<void> {
        this.log.silly(`delForeignObjectAsync(${id}, ${JSON.stringify(options)})`);
        await this.delForeignObjectAsync(id, options);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        this.log.debug(`Booting '${this.name}'...`);

        await this.subscribeForeignObjectsAsync("*");
        await this.subscribeStatesWithCustomEnabled(this.subscribedStates);

        this.log.debug(`Booting '${this.name}' finished`);
    }

    private async subscribeStatesWithCustomEnabled(subscribedStates: Array<string>): Promise<void> {
        const view = await this.getObjectViewAsync("system", "custom", {});
        for (const row in view.rows) {
            const id = view.rows[row].id;
            await this.handleSubscribeStateAsync(id, subscribedStates);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     */
    private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        const customObject = this.getCustomObject(obj);
        await this.handleOnObjectChangeAsync(id, customObject, this.subscribedStates);
    }

    private getCustomObject(obj: ioBroker.Object | null | undefined): customOptions | undefined {
        return obj?.common?.custom?.[this.namespace];
    }

    private async handleOnObjectChangeAsync(
        id: string,
        options: customOptions | undefined,
        subscribedStates: Array<string>,
    ): Promise<void> {
        if (options === undefined && subscribedStates.includes(id)) {
            this.log.info(`Disabled expansion of state '${id}'`);
            await this.handleUnsubscribeStateAsync(id, subscribedStates);
        } else if (options !== undefined) {
            this.log.info(`Enabled expansion of state '${id}'`);
            if (options?.expandNow == true) {
                const state = await this.getForeignStateAsync(id);
                this.log.debug("Expand " + state?.val);
                await this.expandValueAsync(state?.val, options);
            }

            await this.handleSubscribeStateAsync(id, subscribedStates);
        }
    }

    private async handleSubscribeStateAsync(id: string, subscribedStates: Array<string>): Promise<boolean> {
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

    private async handleUnsubscribeStateAsync(id: string, subscribedStates: Array<string>): Promise<boolean> {
        if (!subscribedStates.includes(id)) {
            this.log.debug(`Not subscribed to '${id}' state changes`);
            return true;
        }

        this.log.debug(`Unsubscribe from '${id}' state changes`);
        await this.unsubscribeForeignStatesAsync(id);

        subscribedStates.splice(
            subscribedStates.findIndex((item) => item == id),
            1,
        );

        if (this.log.level == "debug") {
            this.log.debug(`handleUnsubscribeStateAsync subscribedStates: ${JSON.stringify(subscribedStates)}`);
        }

        return true;
    }

    private async expandValueAsync(value: any, options: customOptions): Promise<void> {
        const json = this.maybeConvert(value);
        this.log.debug(`Expanding into state '${options.rootObjectId}.${options.channelName}'`);
        this.setForeignObjectNotExistsAsync(`${options.rootObjectId}.${options.channelName}`, {
            type: "channel",
            common: {
                name: options.channelName || "",
            },
            native: {},
        });
        await this.json2iob.parse(options.rootObjectId + "." + options.channelName, json, options);
    }

    private maybeConvert(value: any): object | undefined {
        if (value === undefined || value == null) {
            return undefined;
        }
        if (typeof value === "object") {
            return value;
        } else if (
            (value[0] === "{" && value[value.length - 1] === "}") ||
            (value[0] === "[" && value[value.length - 1] === "]")
        ) {
            return JSON.parse(value);
        }
        return value;
    }

    /**
     * Is called if a subscribed state changes
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        await this.handleOnStateChangeAsync(id, state?.val);
    }

    private async handleOnStateChangeAsync(id: string, value: any): Promise<void> {
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
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new JsonExpand(options);
} else {
    // otherwise start the instance directly
    (() => new JsonExpand())();
}
