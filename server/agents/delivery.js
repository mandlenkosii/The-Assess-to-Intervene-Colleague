import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import { BriefSummary } from "@colleague/shared";

function list(value) {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

function changedMarkEvents(log) {
  return list(log).filter((event) =>
    event.kind === "correction" &&
    Number.isFinite(event.data?.before) &&
    Number.isFinite(event.data?.after) &&
    event.data.before !== event.data.after
  );
}

function statusCounts(marks, correctionCount) {
  const counts = { needs_teacher: 0, corrected: correctionCount, total: marks.length };
  for (const mark of marks) {
    if (mark.status === "needs_teacher") counts.needs_teacher += 1;
  }
  return counts;
}

export async function brief({ run }, ctx) {
  const marks = list(run.marks);
  const diagnoses = list(run.diagnoses);
  const counts = statusCounts(marks, changedMarkEvents(run.log).length);
  const learnersNeedingSupport = diagnoses.filter((item) => item.severity !== "on_track").length;
  const grouped = new Map();
  for (const diagnosis of diagnoses.filter((item) => item.severity !== "on_track")) {
    const learners = grouped.get(diagnosis.root_gap) ?? [];
    learners.push(diagnosis.learner_id);
    grouped.set(diagnosis.root_gap, learners);
  }

  let summary = "";
  if (ctx?.llm?.json) {
    // LF on every machine, so the shipped demo answers (keyed on the exact prompt) match on Windows and on Render.
    const prompt = (await fs.readFile(new URL("../prompts/brief.md", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    const facts = {
      scripts_marked: counts.total,
      corrections_made: counts.corrected,
      needs_teacher_review: counts.needs_teacher,
      learners_needing_support: learnersNeedingSupport,
      learner_gaps: [...grouped.entries()].map(([gap, learners]) => ({ gap, learners })),
      class_gaps: run.classGaps ?? [],
      unresolved_learners: marks
        .filter((mark) => mark.status === "needs_teacher")
        .map((mark) => mark.learner_id ?? mark.script_id)
    };
    const generated = BriefSummary.parse(await ctx.llm.json([
      { role: "system", content: prompt },
      { role: "user", content: JSON.stringify(facts) }
    ], { schema: BriefSummary, tier: "small", temperature: 0.2 }));
    summary = generated.summary.trim();
  }

  const lines = [
    "# Class assessment brief",
    "",
    ...(summary ? [summary, ""] : []),
    `- Scripts marked: ${counts.total}`,
    `- Corrections made: ${counts.corrected}`,
    `- Needs teacher review: ${counts.needs_teacher}`,
    `- Learners needing support: ${learnersNeedingSupport}`,
    "",
    "## Learners needing support",
    ...(grouped.size
      ? [...grouped.entries()].map(([gap, learners]) => `- **${gap}:** ${learners.join(", ")}`)
      : ["- No learners were flagged for additional practice."]),
    "",
    "## Class-wide gaps",
    ...(run.classGaps?.length
      ? run.classGaps.map((gap) => `- ${gap.criterion}: ${gap.average_pct.toFixed(1)}% average`)
      : ["- No class-wide gap data available."]),
    "",
    "## Items requiring teacher review",
    ...marks.filter((mark) => mark.status === "needs_teacher")
      .map((mark) => `- ${mark.learner_id ?? mark.script_id}`)
  ];
  return lines.join("\n").trimEnd() + "\n";
}

function getTask(run, learnerId) {
  return run.tasks?.[learnerId] ?? list(run.tasks).find((task) => task.learner_id === learnerId);
}

function emailHtml({ learner, mark, task }) {
  const feedback = String(mark?.feedback ?? "Please review your assessment with your teacher.");
  const questions = task?.questions ?? [];
  return `<div style="font-family:Arial,sans-serif;color:#3F1D4A;line-height:1.55">
    <h2 style="background:#3F1D4A;color:#F9E27D;padding:16px">Your assessment feedback</h2>
    <p>Hello ${escapeHtml(learner.name)},</p><p>${escapeHtml(feedback)}</p>
    ${task ? `<h3>Practice: ${escapeHtml(task.gap)}</h3><p>${escapeHtml(task.instructions)}</p><ol>${questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ol>` : ""}
    <p>Ask your teacher if you would like to discuss any part of this feedback.</p>
  </div>`;
}

async function emitOutbox(outbox, ctx) {
  for (const item of outbox) {
    await ctx?.emit?.({
      t: new Date().toISOString(),
      stage: "deliver",
      agent: "delivery",
      kind: "email",
      ref: item.learner_id,
      message: `Email ${item.status} for ${item.learner_id}`,
      data: {
        status: item.status,
        ...((item.reason ?? item.error) ? { reason: item.reason ?? item.error } : {})
      }
    });
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export async function sendAll(run, {
  excluded = [],
  env = process.env,
  ctx,
  transportFactory = (options) => nodemailer.createTransport(options)
} = {}) {
  const learners = list(run.learners);
  const diagnoses = list(run.diagnoses);
  const marks = list(run.marks);
  const excludedSet = new Set(excluded);
  const outbox = learners.map((learner) => {
    const mark = marks.find((item) => (item.learner_id ?? item.script_id) === learner.learner_id);
    const diagnosis = diagnoses.find((item) => item.learner_id === learner.learner_id);
    return {
      learner_id: learner.learner_id,
      to: learner.email,
      subject: "Your assessment feedback and next steps",
      html: emailHtml({ learner, mark, task: getTask(run, learner.learner_id) }),
      status: excludedSet.has(learner.learner_id)
        ? "skipped"
        : !mark ? "skipped"
        : mark?.status === "needs_teacher" ? "skipped" : "pending",
      reason: excludedSet.has(learner.learner_id)
        ? "Excluded by teacher"
        : !mark ? "No final mark available"
        : mark?.status === "needs_teacher" ? "Needs teacher review" : undefined,
      severity: diagnosis?.severity
    };
  });

  const eligible = outbox.filter((item) => item.status === "pending");
  if (eligible.length && (!env.SMTP_USER || !env.SMTP_PASS)) {
    // Preview mode: no mail account set, so emails are drafted and shown but never sent.
    for (const item of eligible) {
      item.status = "preview";
      item.reason = "Preview only: not sent (SMTP_USER and SMTP_PASS are not set).";
    }
    await emitOutbox(outbox, ctx);
    return outbox;
  }

  if (eligible.length) {
    let transporter;
    try {
      transporter = transportFactory({
        service: "gmail",
        pool: true,
        maxConnections: 3,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
      });
      for (const item of eligible) {
        if (!item.to || item.to.startsWith("TEAM_INBOX_")) {
          item.status = "failed";
          item.error = "Recipient is a placeholder, not a deliverable email address.";
          continue;
        }
        try {
          await transporter.sendMail({
            from: env.SMTP_USER,
            to: item.to,
            subject: item.subject,
            html: item.html
          });
          item.status = "sent";
        } catch (error) {
          item.status = "failed";
          item.error = error instanceof Error ? error.message : String(error);
        }
      }
    } catch (error) {
      for (const item of eligible.filter((item) => item.status === "pending")) {
        item.status = "failed";
        item.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      transporter?.close();
    }
  }
  await emitOutbox(outbox, ctx);
  return outbox;
}

export async function marksXlsx(run, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Marks");
  const marks = list(run.marks);
  const correctedLearners = new Set(changedMarkEvents(run.log).map((event) => event.ref));
  const criteria = [...new Set(marks.flatMap((mark) => mark.scores.map((score) => score.criterion)))];
  sheet.columns = [
    { header: "Learner", key: "learner_id", width: 18 },
    ...criteria.map((criterion, index) => ({ header: criterion, key: `criterion_${index}`, width: 18 })),
    { header: "Total %", key: "total_pct", width: 12 },
    { header: "Status", key: "status", width: 18 },
    { header: "Corrected", key: "corrected", width: 12 },
    { header: "Root gap", key: "root_gap", width: 28 }
  ];
  for (const mark of marks) {
    const learnerId = mark.learner_id ?? mark.script_id;
    const diagnosis = list(run.diagnoses).find((item) => item.learner_id === learnerId);
    const row = {
      learner_id: learnerId,
      total_pct: mark.total_pct,
      status: mark.status ?? "ok",
      corrected: correctedLearners.has(learnerId) ? "Yes" : "No",
      root_gap: diagnosis?.root_gap ?? ""
    };
    criteria.forEach((criterion, index) => {
      row[`criterion_${index}`] = mark.scores.find((score) => score.criterion === criterion)?.score ?? "";
    });
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFF9E27D" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3F1D4A" } };
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await workbook.xlsx.writeFile(outputPath);
  }
  return workbook;
}

export async function saveBrief(run, outputDirectory, ctx) {
  const content = await brief({ run }, ctx);
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, "brief.md"), content, "utf8");
  return content;
}
