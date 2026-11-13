const ordinaryTopics = [
  ["L001", "shared devices", "learners who do not own a device", "a supervised class tablet trolley", [16, 14, 15, 15, 16]],
  ["L002", "quick research", "a teacher-approved dictionary app", "checking a source before using its facts", [14, 13, 14, 14, 15]],
  ["L003", "emergency contact", "a learner who travels far to school", "keeping phones away during lessons", [13, 11, 13, 14, 14]],
  ["L004", "digital responsibility", "practising respectful online behaviour", "clear rules about when a phone may be used", [15, 13, 14, 15, 15]],
  ["L005", "class participation", "answering a short anonymous poll", "putting devices away for discussion", [12, 12, 12, 13, 13]],
  ["L006", "distraction", "a message arriving during a lesson", "silent mode and a storage pocket", [14, 12, 13, 14, 14]],
  ["L007", "unequal access", "learners with limited data", "paper alternatives for every activity", [13, 12, 14, 13, 14]],
  ["L008", "cyberbullying", "a photo shared without permission", "a consistent school phone policy", [15, 14, 14, 14, 15]],
  ["L009", "study support", "a revision quiz after class", "teacher-selected learning apps", [12, 11, 13, 13, 13]],
  ["L010", "lost learning time", "a class stopping to answer notifications", "phones remaining in bags", [11, 10, 12, 12, 12]],
  ["L011", "learner independence", "planning homework reminders", "using phones only at break", [14, 13, 13, 14, 14]],
  ["L012", "school safety", "a learner needing to contact family", "staff-managed access in an emergency", [13, 12, 14, 14, 14]],
  ["L013", "language learning", "recording pronunciation for practice", "asking permission before recording", [15, 14, 14, 15, 15]],
  ["L014", "attention", "switching between a worksheet and social media", "a phone-free lesson routine", [12, 11, 13, 13, 13]],
  ["L015", "responsible use", "a class agreement written with learners", "consequences applied fairly", [16, 15, 15, 15, 16]],
  ["L016", "practical learning", "taking a picture of a science result", "deleting images after teacher review", [13, 12, 13, 14, 14]],
  ["L017", "homework access", "checking a task when away from a textbook", "printed notes for learners without data", [14, 13, 14, 14, 14]],
  ["L018", "privacy", "personal messages appearing on a shared screen", "keeping private information off class displays", [15, 14, 15, 14, 15]],
  ["L019", "fair rules", "different teachers giving different instructions", "one policy explained to every class", [13, 12, 13, 13, 14]],
  ["L020", "wellbeing", "pressure to reply immediately", "a school day with phone-free learning time", [12, 11, 12, 13, 13]],
  ["L021", "teacher support", "a teacher projecting a prepared quiz", "phones used only when the lesson needs them", [15, 14, 14, 15, 15]],
  ["L022", "accountability", "a learner repeatedly breaking the rule", "a warning followed by a fair consequence", [14, 12, 14, 14, 14]],
  ["L023", "balanced policy", "benefits and risks depending on the lesson", "teacher permission rather than a total ban", [17, 15, 16, 16, 17]]
];

const criteria = ["argument", "evidence", "structure", "language", "audience"];
const ordinaryScores = ordinaryTopics.map(([id, , , , scores]) => ({
  script_id: id,
  scores: Object.fromEntries(criteria.map((criterion, index) => [criterion, scores[index]])),
  trap: null
}));

function ordinaryEssay(topic, example, safeguard) {
  const [id, issue, learnerNeed, policy, scores] = topic;
  return {
    script_id: id,
    text: [
      `Cellphones can help learners, but they can also interrupt a lesson. In a South African classroom, the question should not be answered with a rule that ignores what teachers and learners actually need. I believe ${policy} is a better choice than allowing every phone to be used at any time. A fair policy can protect learning while still making room for useful technology.`,
      `One reason is that a phone can support ${issue}. For example, ${example}. This is useful only when learners know what they are trying to find and the teacher has checked that the activity fits the lesson. A phone is a tool, not proof that learning has happened. Learners should explain what they found in their own words and show how it answers the question.`,
      `There is also a responsibility to include everyone. ${learnerNeed} should not be placed at a disadvantage because another learner owns a newer phone or can afford more data. Teachers can give a printed option or let a group share a school device. That way, the task is about the subject and not about who has money for airtime. This matters in schools where families have different resources.`,
      `Some people may say that any phone in class will distract learners. This concern is real: a notification can take attention away from a difficult explanation, and a camera can create privacy problems. However, a complete ban may remove a helpful learning tool too. ${safeguard}. If the phone is not needed, it should stay away for that lesson. Teachers must apply the same rule to every learner.`,
      `In conclusion, cellphones should be allowed only for a clear learning purpose and with the teacher's permission. This approach supports useful activities, respects learners who do not have a device, and reduces interruptions. Schools should explain their rules to learners and families before problems happen. With a sensible policy, technology can assist a lesson without becoming more important than the lesson itself.`
    ].join("\n\n")
  };
}

const specialScripts = [
  {
    script_id: "L024",
    trap: "long_off_topic",
    text: "School uniforms are part of many learners' lives. A uniform can make a school look organised, but it can also cost money. Families need time to buy the right clothes before term starts. Some learners prefer a jersey because winter mornings are cold. Other learners say that choosing a shirt helps them express who they are. Schools should explain their uniform rules clearly and allow a reasonable option when a family cannot afford every item. The office can help families find second-hand clothes, and learners should not be embarrassed in front of their classmates. A uniform does not automatically make a learner behave well. Good teaching and respectful rules matter more. Learners also need to keep their clothes clean and arrive on time. If a button breaks, a teacher should speak kindly instead of making a public example of the learner. Parents and schools can work together to plan costs, check sizes and share spare clothes. This can prevent a small problem from keeping someone out of class. In the end, a uniform is useful when it creates a sense of belonging without becoming a reason to punish learners who are struggling. Schools should listen to the community and review their rules each year. Different schools have different weather, transport and family needs. A practical uniform policy should be clear, affordable and fair to every learner. These points show that uniforms deserve careful thought, and the school community should make the decision together. A school may ask its governing body to discuss the matter with parents and learners. The decision should consider comfort, price and the way clothing rules affect school attendance. This discussion is useful for planning a uniform policy.",
    scores: { argument: 2, evidence: 3, structure: 14, language: 16, audience: 10 }
  },
  {
    script_id: "L025",
    trap: "short_excellent",
    text: "Cellphones should be allowed only when a teacher chooses a clear learning activity. A dictionary app can help with a difficult word, but a notification can interrupt the whole class. Learners without data must receive a paper option so that the rule stays fair. Phones should remain in bags unless the teacher gives permission, and private messages or photographs should never be part of a lesson. This balanced policy uses technology when it helps and puts learning first.",
    scores: { argument: 18, evidence: 16, structure: 18, language: 18, audience: 18 }
  },
  {
    script_id: "L026",
    trap: "fluent_no_evidence",
    text: "Cellphones in classrooms represent a complicated policy question. A carefully designed approach can help learners develop independence while protecting concentration. Digital tools offer remarkable opportunities for research, revision and collaboration. At the same time, unrestricted access can undermine attention and weaken the relationship between teachers and learners. A school should therefore create a consistent framework that permits purposeful use while limiting avoidable disruption. The framework should be communicated to families, reviewed regularly and applied fairly across grades. Teachers need discretion to decide whether a device supports a particular activity. Learners also need guidance about respectful communication and responsible online behaviour. These principles can produce a balanced environment in which technology contributes to educational progress rather than controlling it. Schools that adopt thoughtful rules are better positioned to respond to change and prepare young people for future responsibilities. A complete ban may seem simple, but it does not teach learners how to make careful choices. Equally, unrestricted access sends the message that every digital activity is appropriate at every moment. Neither extreme recognises the different needs of a lesson. The best policy gives teachers clear authority, provides alternatives for learners without devices and explains consequences before they are needed. This is a reasonable way to protect learning and make technology useful. A written policy can also set expectations for families and staff. It should be reviewed whenever teaching practices change. Learners should understand that responsible technology use is part of their preparation for adult life. A balanced approach makes the classroom more adaptable.",
    scores: { argument: 15, evidence: 2, structure: 17, language: 18, audience: 16 }
  },
  {
    script_id: "L027",
    trap: "borderline",
    text: "Phones can help with schoolwork but they can also disturb the class. I think the teacher must decide when they are used. A learner may use a dictionary to understand a word. Not everyone has data, so a teacher should have another way to do the task. This is important because school should be fair.\n\nSome learners say phones are always a problem. They can distract people, especially if messages arrive. The phone should be silent and in the bag unless it is needed. A learner who takes a picture should ask first. This can protect people. Teachers should explain the rules, because different rules can confuse a class.\n\nIn conclusion phones should be allowed sometimes. Teachers must make sure they help learning and that every learner can take part. Learners who do not have a phone should still be able to complete every classroom activity. A printed worksheet is a fair option, and sharing a school device may help with a short research task. Teachers can decide whether a phone is useful for each lesson. If it is not useful, the device should stay away so that the class can concentrate. A rule should also explain what happens when someone does not follow it. Families should receive the information before the school year begins, and learners should be allowed to ask questions about the policy.",
    scores: { argument: 10, evidence: 8, structure: 11, language: 11, audience: 12 }
  },
  {
    script_id: "L028",
    trap: "borderline",
    text: "A cellphone can be useful for school, although it can distract learners. The school should let teachers decide when it is needed. A learner could check a word in a dictionary app, but paper dictionaries must also be available. Some families do not have enough data, so online homework should not be the only choice.\n\nPhones can also bring problems. Messages may arrive in the middle of a lesson, and a photograph can make someone uncomfortable. Teachers should tell learners when to keep phones away. The rules must be the same in each class so that learners know what to expect.\n\nI think phones should be allowed for a planned activity. They should not be used just because a learner feels bored. A school should listen to teachers and learners when it makes its rules. This may help everyone feel included. Learners should know why a phone is allowed for one task but not another. Teachers can give a simple explanation before asking the class to begin. If a learner has no device, a partner can share one or the teacher can provide another way to learn. This is important because marks should show what a learner understands, not what kind of phone a family can buy. At home, parents can also ask learners to put their phones away while they finish homework. In my view, a clear rule is better than arguing every day about what is permitted. A school can ask learners for feedback and change a rule if it causes a problem. Adults must still make the final decision, because they are responsible for keeping lessons safe and focused.",
    scores: { argument: 11, evidence: 9, structure: 12, language: 12, audience: 12 }
  },
  {
    script_id: "L029",
    trap: "weak_structure_only",
    text: "At break the bell rings and learners go outside. A dictionary on a phone can explain a word, so the teacher should allow it. Some learners do not have data, and paper is still needed. Phones are not the only answer. A school rule should be fair.\n\nMessages come in while the teacher is explaining. That is why phones can be distracting. Learners can put them away. Teachers should choose the activity. A learner should ask before taking a photo. Other people have a right to privacy. The class may use a quiz. It is easier to answer quickly. The teacher can collect the phones afterwards.\n\nFamilies need to know about the rules. Some learners travel far, but emergencies should go through the office. Phones help with research. They also make noise. A complete ban is not the same as teaching responsibility. A school should have one rule. Every teacher should follow it. There must be a paper choice. Learners can share a device. The class should finish its work. A phone should not replace a book. In conclusion, the teacher must decide when it helps. Phones should be allowed for learning. They should stay away at other times. Learners can also use a timer for a classroom activity. They should not open games during a lesson. Parents can read the policy at home. Some phones are old and may stop working. A learner can ask to share with a friend. The school can keep spare books in each classroom. Teachers can explain the rule again if someone is confused. All learners should have a chance to finish the same task. The phone can be helpful, but it cannot solve every problem at school.",
    scores: { argument: 12, evidence: 12, structure: 5, language: 14, audience: 13 }
  },
  {
    script_id: "L030",
    trap: "weak_structure_only",
    text: "The school can write one rule for phones. Learners should not be embarrassed. Some have no data. A phone can show a picture in science. The teacher must give permission. Privacy is important.\n\nA learner should put it away after the activity. Messages can distract the class. There are books too. A quiz can be on a phone. Not everyone has one. The teacher can make groups. A school should tell parents. A lesson needs attention. Phones can help with words. Some learners travel far. The office can call home in an emergency.\n\nIf the teacher says no, learners must listen. There can be a paper task. The phone must not be used to take pictures of other people. A rule should be fair. Some learners can use an app. Other learners need a printed page. It is about learning, not showing off. In conclusion, phones should be allowed sometimes. They must be away when they are not needed. Teachers should decide. Everyone should understand the rule. Learners can help write a class agreement. The teacher can check if everyone has finished the work. A phone should be silent before the lesson starts. A family can contact the school office. The school can keep extra worksheets for learners who need them. Sometimes a phone has a cracked screen. The teacher should not make a learner feel ashamed about it. Learners should use only the app that the teacher selected. Then they can put the phone back in the bag. Some classes need more time for reading than for using technology. The teacher can make that choice. Fairness is important for everyone in the class.",
    scores: { argument: 12, evidence: 11, structure: 4, language: 13, audience: 12 }
  }
];

const scriptExtensions = {
  L027: "Learners can ask a teacher for help when the instructions are unclear. The class should have time to practise the rule before the teacher gives a mark. This would make it easier for everyone to understand what is expected."
};

export const demoScripts = Object.freeze([
  ...ordinaryTopics.map((topic) => ({
    ...ordinaryEssay(topic, topic[2], topic[3]),
    trap: null
  })),
  ...specialScripts.map((script) => ({
    ...script,
    text: scriptExtensions[script.script_id]
      ? `${script.text} ${scriptExtensions[script.script_id]}`
      : script.text
  }))
]);

export const expectedMarks = Object.freeze([
  ...ordinaryScores,
  ...specialScripts.map(({ script_id, trap, scores }) => ({
    script_id,
    scores,
    trap
  }))
]);
