/** Sample schedule CSV fixtures for tests and UI demos. */

/**
 * Real-world CMFC tournament export (trimmed). Exercises the tricky bits:
 *  - title/legend junk rows above the header
 *  - a header that is not the first row
 *  - date-divider and section-header rows interspersed with data
 *  - a team identity that must be matched inside long home/away names
 *  - multi-line quoted cells (championship placeholders)
 */
export const CMFC_SCHEDULE_FIXTURE_CSV = `CMFC Combined Match Schedule,,,,,,,,,
TEAM COLOR LEGEND,,,,,,,,,
,  CMFC Purple,,,CMFC White 22U,,,CMFC 9U Schultz,,
,CMFC 17U Brannan,,,CMFC Brannan 12U,,,CMFC Girls 12U,,
,,,,,,,,,
Team,Match #,Date,Time,Home Team,Score,Away Team,Location,Division,Status
"Saturday, June 27, 2026",,,,,,,,,
CMFC White,441,"Saturday, June 27, 2026",9:45 AM EDT,Central Michigan Football Club CMFC White,-,DSI,Grand Haven State Beach - 17,Sand Boys U20-22,
CMFC Purple,495,"Saturday, June 27, 2026",10:30 AM EDT,Central Michigan Football Club CMFC Purple,-,Hot Shots,Grand Haven State Beach - 009,Sand Boys U13,
CMFC Girls 12U,85,"Saturday, June 27, 2026",10:30 AM EDT,lakeshore 2015 girls,-,Central Michigan Football Club CMFC Girls 12U,Grand Haven State Beach - 10,Sand Girls U12,
CMFC White,445,"Saturday, June 27, 2026",12:45 PM EDT,Muggers FC,-,Central Michigan Football Club CMFC White,Grand Haven State Beach - 17,Sand Boys U20-22,
 Championship Games Schedule,,,,,,,,,
CMFC 17U Brannan,382,"Sunday, June 28, 2026",10:30 AM EDT,"Semi-Final Placeholder
Bracket A #1 vs Bracket B #2",-,Central Michigan Football Club CMFC 17U Brannan,Grand Haven State Beach - 21,Sand U16/17 Boys,
`;
