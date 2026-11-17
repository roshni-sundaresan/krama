/**
 * iDhi integration (Idealake meeting-intelligence product).
 * Krama consumes iDhi via its APIs/SSO; it does not build iDhi.
 */
export interface IdhiMeetingSummary {
  id: string;
  title: string;
  date: string;
  participants: string[];
}

export interface IdhiMeeting extends IdhiMeetingSummary {
  /** Transcript as plain text, one utterance per line ("[hh:mm:ss] Speaker: text"). */
  transcript: string;
}

export interface IdhiAdapter {
  listMeetings(opts: { tenantId: string; query?: string }): Promise<IdhiMeetingSummary[]>;
  getMeeting(opts: { tenantId: string; meetingId: string }): Promise<IdhiMeeting>;
}

export const IDHI_ADAPTER = Symbol("IDHI_ADAPTER");

const MOCK_MEETINGS: IdhiMeeting[] = [
  {
    id: "idhi-mtg-101",
    title: "LOP-MOM-01 Kick-off: loan origination",
    date: "2026-11-04T10:00:00+05:30",
    participants: ["Asha Rao (Client product owner)", "Ravi (BA)", "Meera (Tech Architect)"],
    transcript: [
      "[00:01:10] Asha: Applicants must be able to apply for a personal loan on the web and the mobile app.",
      "[00:03:42] Asha: Each application must get a reference number by SMS and email within one minute of submission.",
      "[00:06:15] Ravi: Credit officers need to see a queue of new applications sorted by amount and date.",
      "[00:08:05] Asha: For testing, use the sample applicant Priya at 98765 43210, PAN ABCDE1234F.",
      "[00:09:30] Meera: Bank staff must sign in with the bank's single sign-on and multi-factor authentication.",
      "[00:12:05] Asha: All customer data must stay in India because of RBI requirements.",
      "[00:15:40] Ravi: Officers should be able to request more documents from the applicant.",
      "[00:18:22] Asha: The dashboard should be fast and user-friendly.",
    ].join("\n"),
  },
  {
    id: "idhi-mtg-102",
    title: "LOP-MOM-02 Credit workflow and reporting",
    date: "2026-11-07T15:00:00+05:30",
    participants: ["Asha Rao (Client product owner)", "Ravi (BA)"],
    transcript: [
      "[00:00:45] Asha: A credit manager must approve every loan above 5 lakh before disbursal.",
      "[00:04:10] Ravi: The system shall keep an audit trail of every credit decision.",
      "[00:06:30] Asha: The system must fetch the credit score from the credit bureau for each applicant.",
      "[00:07:55] Asha: Managers want to export monthly approval statistics as CSV.",
    ].join("\n"),
  },
];

/** Deterministic mock used until iDhi API access is wired. */
export class MockIdhiAdapter implements IdhiAdapter {
  async listMeetings({ query }: { tenantId: string; query?: string }): Promise<IdhiMeetingSummary[]> {
    return MOCK_MEETINGS.filter((m) => !query || m.title.toLowerCase().includes(query.toLowerCase())).map(
      ({ transcript: _t, ...summary }) => summary,
    );
  }

  async getMeeting({ meetingId }: { tenantId: string; meetingId: string }): Promise<IdhiMeeting> {
    const m = MOCK_MEETINGS.find((x) => x.id === meetingId);
    if (!m) throw new Error(`iDhi meeting ${meetingId} not found`);
    return m;
  }
}

/**
 * TODO: implement against the real iDhi API (auth via iDhi SSO / service credentials).
 * Endpoints, auth scheme and transcript format to be confirmed with the iDhi team.
 */
export class HttpIdhiAdapter implements IdhiAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
  ) {}

  async listMeetings(): Promise<IdhiMeetingSummary[]> {
    throw new Error(`HttpIdhiAdapter not implemented (base URL ${this.baseUrl}, key ${this.apiKey ? "set" : "unset"})`);
  }

  async getMeeting(): Promise<IdhiMeeting> {
    throw new Error("HttpIdhiAdapter not implemented");
  }
}
