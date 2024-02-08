export const SCgDebug = {

    enabled: true,

    error: function (message: string) {
        if (!this.enabled) return; // do nothing

        throw message;
    }

}