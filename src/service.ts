import { ScAddr } from "ts-sc-client";
import { SCgViewMode } from "./config";
import { DefaultSCgSearcher, DistanceBasedSCgSearcher, SCgSearcher } from "./content-search";

const searchers: Record<SCgViewMode, SCgSearcher> = {
    [SCgViewMode.DefaultSCgView]: new DefaultSCgSearcher(),
    [SCgViewMode.DistanceBasedSCgView]: new DefaultSCgSearcher()
}

export class SCgService {
    searcher: SCgSearcher;
    constructor() {
    this.searcher = searchers[SCgViewMode.DefaultSCgView];

}
async updateContent (keyElement?: ScAddr) {
    const keyElements = keyElement ? [keyElement] : undefined;
    if (!await this.searcher.searchContent(keyElements)) {
        // We're using a default searcher if the chosen searcher failed
        await searchers[SCgViewMode.DefaultSCgView].searchContent();
    }
};
}