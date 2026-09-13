export type QuestionSuiteInput = {
  name: string;
  websiteId: string;
  questions: string[];
  language: string;
  locale: string;
};

export const QUESTION_SUITE_MAX_QUESTIONS = 10;
export const QUESTION_SUITE_MAX_QUESTION_LENGTH = 300;

/** Draft validation is shared by the editor and the save-only endpoint. */
export function parseQuestionSuiteInput(value: unknown): QuestionSuiteInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Use a question suite object.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["name", "websiteId", "questions", "language", "locale"].includes(key)))
    throw new Error("The question suite contains an unsupported field.");
  const text = (value: unknown, label: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value))
      throw new Error(`Use ${label} of 1–${max} characters without control characters.`);
    return value.trim();
  };
  const name = text(input.name, "a suite name", 100);
  const websiteId = text(input.websiteId, "a saved website ID", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(websiteId)) throw new Error("Choose a saved website.");
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > QUESTION_SUITE_MAX_QUESTIONS)
    throw new Error(`Add 1–${QUESTION_SUITE_MAX_QUESTIONS} questions.`);
  const questions = input.questions.map(value => text(value, "each question", QUESTION_SUITE_MAX_QUESTION_LENGTH));
  if (new Set(questions.map(question => question.toLocaleLowerCase("en-US"))).size !== questions.length)
    throw new Error("Remove duplicate questions from this suite.");
  const result = { name, websiteId, questions, language: text(input.language ?? "English", "a language", 40), locale: text(input.locale ?? "United States", "a locale", 40) };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 4096) throw new Error("Shorten the questions so the saved suite fits within 4 KB.");
  return result;
}
