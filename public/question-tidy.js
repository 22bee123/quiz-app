// Strips "according to the material" / "in this module" style references from quiz questions.
// Students found them noisy; the question should ask about the subject, not the handout.
// Shared by server.js (new cards) and app.js (cards already saved before this existed).
(function (root) {
  const DET = '(?:the|this|these|our|given|provided|above)(?:\\s+(?:given|provided|above))?';
  // Anything that names the source document. "text"/"author" only count when introduced by
  // "according to" / "based on", where they can never be part of the actual question.
  const SRC = '(?:(?:module|study|learning|reading|course|lesson)\\s+materials?|materials?|modules?|handouts?|lessons?|passages?|lectures?|readings?)';
  const SRC_ANY = '(?:' + SRC + '|text|author|document|discussion|content|notes|source)';
  const VERB = '(?:stated|discussed|described|mentioned|explained|presented|covered|introduced|defined|shown|given|outlined)';

  const RULES = [
    // "(according to the material)"
    [new RegExp('\\s*\\((?:according to|based on|per|see|from)\\s+' + DET + '\\s+' + SRC_ANY + '\\)', 'gi'), ''],
    // "According to the module material, what…" / "In this module, what…"
    [new RegExp('^\\s*(?:according to|based on|as ' + VERB + ' in|in|from|per|within)\\s+' + DET + '\\s+' + SRC_ANY + "(?:'s)?\\s*,\\s*", 'i'), ''],
    // "Ethics, according to the material, is…"
    [new RegExp(',\\s*(?:according to|based on|as ' + VERB + ' in)\\s+' + DET + '\\s+' + SRC_ANY + '\\s*,', 'gi'), ''],
    // "what does the material conclude?" → "what can be concluded?"
    [new RegExp('\\bwhat does\\s+' + DET + '\\s+' + SRC_ANY + '\\s+conclude\\b', 'gi'), 'what can be concluded'],
    // "what does the module say about X?" → "what is true about X?"
    [new RegExp('\\bwhat does\\s+' + DET + '\\s+' + SRC_ANY + '\\s+(?:say|state|suggest|imply|claim)\\s+about\\b', 'gi'), 'what is true about'],
    // "Which theory (that is) discussed in the module says…" → "Which theory says…"
    [new RegExp('\\s+(?:that\\s+(?:is|was|are|were)\\s+|which\\s+(?:is|was|are|were)\\s+)?' + VERB + '\\s+in\\s+' + DET + '\\s+' + SRC + '\\b', 'gi'), ''],
    // "…, according to the material?" / "…in this module material?" at the very end
    [new RegExp('\\s*,?\\s+(?:according to|based on|per)\\s+' + DET + '\\s+' + SRC_ANY + '(?=\\s*[?.!]?\\s*$)', 'i'), ''],
    [new RegExp('\\s*,?\\s+(?:in|from|within)\\s+' + DET + '\\s+' + SRC + '(?=\\s*[?.!]?\\s*$)', 'i'), ''],
  ];

  function tidyQuestion(question) {
    const original = String(question == null ? '' : question);
    let q = original;
    for (const [re, rep] of RULES) q = q.replace(re, rep);
    q = q.replace(/\s{2,}/g, ' ').replace(/\s+([?.!,])/g, '$1').replace(/,([?.!])/g, '$1').trim();
    // Never let the cleanup hollow a question out.
    if ((q.match(/\p{L}{2,}/gu) || []).length < 2) return original.trim();
    return q.charAt(0).toUpperCase() + q.slice(1);
  }

  if (typeof module === 'object' && module.exports) module.exports = tidyQuestion;
  else root.tidyQuestion = tidyQuestion;
})(typeof window !== 'undefined' ? window : globalThis);
