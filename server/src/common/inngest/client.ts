import { Inngest } from "inngest";

// Distinct from any other Inngest app that might share this codebase (e.g. a
// separate deployment elsewhere) — Inngest identifies apps by this id, not
// by which URL syncs to it, so a shared id would collide with that app.
export const inngest = new Inngest({ id: "abhyaslm-ec2" });
