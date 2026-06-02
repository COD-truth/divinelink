import { db, type Survey, type SurveyQuestion, type SurveyResponse } from "@/lib/db";

/** Random short invite code, e.g. "K3R-7QX-92" — easy to type on a phone. */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${seg(3)}-${seg(3)}-${seg(2)}`;
}

export function newQuestion(type: SurveyQuestion["type"] = "short_text"): SurveyQuestion {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    text: "",
    required: false,
    options: type === "single_choice" || type === "multi_choice" ? ["Option 1", "Option 2"] : undefined,
    ratingMax: type === "rating" ? 5 : undefined,
  };
}

export async function getSurveyByCode(code: string): Promise<Survey | undefined> {
  return db.surveys.where("inviteCode").equals(code).first();
}

export interface QuestionStats {
  question: SurveyQuestion;
  counts: Record<string, number>;
  textValues: string[];
  numericAvg?: number;
  numericValues: number[];
  total: number;
}

export function computeStats(
  questions: SurveyQuestion[],
  responses: SurveyResponse[]
): QuestionStats[] {
  return questions.map(q => {
    const counts: Record<string, number> = {};
    const textValues: string[] = [];
    const numericValues: number[] = [];
    let total = 0;
    for (const r of responses) {
      const v = r.answers?.[q.id];
      if (v == null || v === "") continue;
      total++;
      if (q.type === "single_choice" || q.type === "date") {
        const k = String(v);
        counts[k] = (counts[k] || 0) + 1;
      } else if (q.type === "multi_choice") {
        const arr = Array.isArray(v) ? v : [v];
        arr.forEach(opt => {
          const k = String(opt);
          counts[k] = (counts[k] || 0) + 1;
        });
      } else if (q.type === "rating") {
        const n = Number(v);
        if (!isNaN(n)) {
          numericValues.push(n);
          counts[String(n)] = (counts[String(n)] || 0) + 1;
        }
      } else {
        textValues.push(String(v));
      }
    }
    const numericAvg = numericValues.length
      ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
      : undefined;
    return { question: q, counts, textValues, numericAvg, numericValues, total };
  });
}

export function responsesToCsv(survey: Survey, responses: SurveyResponse[]): string {
  const headers = [
    "Response ID", "Respondent", "Phone", "Started", "Completed",
    ...survey.questions.map(q => q.text || q.id),
  ];
  const escape = (s: any) => {
    const v = s == null ? "" : Array.isArray(s) ? s.join("; ") : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const rows = responses.map(r => [
    r.id, r.respondentName || "", r.respondentPhone || "",
    r.startedAt, r.completedAt || "",
    ...survey.questions.map(q => escape(r.answers?.[q.id])),
  ].join(","));
  return [headers.map(escape).join(","), ...rows].join("\n");
}
