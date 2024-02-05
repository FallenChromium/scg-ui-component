export const enum SCgViewMode  
{
    DefaultSCgView = 'default_scg_view',
    DistanceBasedSCgView = 'distance_based_scg_view', 
}

export const enum SCgEditMode {
    SCgModeSelect = 0,
    SCgModeEdge = 1,
    SCgModeBus = 2,
    SCgModeContour = 3,
    SCgModeLink = 4,
    SCgViewOnly = 5,


};

const enum editModes {
    'scg_just_view' = SCgEditMode.SCgViewOnly,
    'scg_view_only' = SCgEditMode.SCgViewOnly,
};


export class SCgConfig {
    public readonly viewMode: SCgViewMode = SCgViewMode.DefaultSCgView;
    public readonly editMode: SCgEditMode = SCgEditMode.SCgModeSelect;
    private static instance: SCgConfig;

    private constructor() {
        // Private constructor to prevent creating instances directly
    }

    public static getInstance(): SCgConfig {
        if (!SCgConfig.instance) {
            SCgConfig.instance = new SCgConfig();
        }
        return SCgConfig.instance;
    }

}