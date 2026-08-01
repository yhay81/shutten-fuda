import { markVisit, sendEvent } from "/common.js";

markVisit();
if ([...new URLSearchParams(location.search).keys()].length) void sendEvent("directory_searched");
