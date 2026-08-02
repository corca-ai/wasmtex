const n = [
  "article",
  "book",
  "mvbook",
  "inbook",
  "bookinbook",
  "suppbook",
  "booklet",
  "collection",
  "mvcollection",
  "incollection",
  "suppcollection",
  "manual",
  "misc",
  "online",
  "patent",
  "periodical",
  "suppperiodical",
  "proceedings",
  "mvproceedings",
  "inproceedings",
  "reference",
  "mvreference",
  "inreference",
  "report",
  "set",
  "thesis",
  "unpublished",
  "xdata",
  "conference",
  "electronic",
  "mastersthesis",
  "phdthesis",
  "techreport",
  "www"
], l = [
  "author",
  "editor",
  "editora",
  "editorb",
  "editorc",
  "translator",
  "annotator",
  "commentator",
  "introduction",
  "foreword",
  "afterword",
  "holder",
  "title",
  "subtitle",
  "titleaddon",
  "maintitle",
  "mainsubtitle",
  "maintitleaddon",
  "booktitle",
  "booksubtitle",
  "booktitleaddon",
  "journaltitle",
  "journalsubtitle",
  "journal",
  "date",
  "year",
  "month",
  "day",
  "eventdate",
  "origdate",
  "urldate",
  "volume",
  "volumes",
  "number",
  "issue",
  "edition",
  "version",
  "series",
  "chapter",
  "pages",
  "pagetotal",
  "pagination",
  "publisher",
  "institution",
  "organization",
  "location",
  "venue",
  "type",
  "howpublished",
  "note",
  "addendum",
  "doi",
  "eprint",
  "eprinttype",
  "eprintclass",
  "url",
  "isbn",
  "issn",
  "isrn",
  "ismn",
  "iswc",
  "language",
  "langid",
  "keywords",
  "abstract",
  "annotation",
  "crossref",
  "xref",
  "xdata",
  "related",
  "relatedtype",
  "options",
  "shorthand",
  "sortkey",
  "sortname",
  "sorttitle",
  "sortyear"
], s = {
  article: [
    "author",
    "title",
    "journaltitle",
    "journal",
    "date",
    "year",
    "volume",
    "number",
    "pages"
  ],
  book: ["author", "editor", "title", "publisher", "location", "date", "year", "edition", "volume"],
  mvbook: ["author", "editor", "title", "publisher", "location", "date", "year", "volumes"],
  inbook: [
    "author",
    "title",
    "booktitle",
    "editor",
    "publisher",
    "location",
    "date",
    "year",
    "chapter",
    "pages"
  ],
  bookinbook: ["author", "title", "booktitle", "editor", "publisher", "date", "year", "pages"],
  collection: ["editor", "title", "publisher", "location", "date", "year", "edition"],
  mvcollection: ["editor", "title", "publisher", "location", "date", "year", "volumes"],
  incollection: [
    "author",
    "title",
    "booktitle",
    "editor",
    "publisher",
    "location",
    "date",
    "year",
    "pages"
  ],
  proceedings: ["editor", "title", "publisher", "location", "venue", "eventdate", "date", "year"],
  mvproceedings: [
    "editor",
    "title",
    "publisher",
    "location",
    "eventdate",
    "date",
    "year",
    "volumes"
  ],
  inproceedings: [
    "author",
    "title",
    "booktitle",
    "editor",
    "venue",
    "eventdate",
    "date",
    "year",
    "pages"
  ],
  conference: ["author", "title", "booktitle", "editor", "venue", "date", "year", "pages"],
  thesis: ["author", "title", "type", "institution", "location", "date", "year"],
  mastersthesis: ["author", "title", "school", "institution", "address", "date", "year"],
  phdthesis: ["author", "title", "school", "institution", "address", "date", "year"],
  report: ["author", "title", "type", "institution", "number", "location", "date", "year"],
  techreport: ["author", "title", "institution", "type", "number", "address", "date", "year"],
  manual: ["author", "editor", "title", "organization", "location", "edition", "date", "year"],
  online: ["author", "editor", "title", "date", "year", "url", "urldate"],
  electronic: ["author", "title", "date", "year", "url", "urldate"],
  www: ["author", "title", "date", "year", "url", "urldate"],
  patent: ["author", "holder", "title", "type", "number", "location", "date", "year"],
  periodical: ["editor", "title", "issuetitle", "volume", "number", "date", "year"],
  unpublished: ["author", "title", "date", "year", "howpublished", "note"],
  misc: ["author", "editor", "title", "date", "year", "howpublished"],
  xdata: []
}, d = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec"
];
function u(t) {
  return n.filter((e) => e.startsWith(t.prefix.toLowerCase())).map(
    (e) => ({
      label: e,
      kind: "module",
      insertText: e,
      detail: "BibTeX/biblatex entry type",
      sortText: `0_${e}`,
      replaceLength: t.prefix.length
    })
  );
}
function p(t) {
  const e = s[t.entryType ?? ""] ?? [], i = [.../* @__PURE__ */ new Set([...e, ...l])], a = new Set(t.usedFields);
  return i.filter((o) => o.startsWith(t.prefix) && !a.has(o)).map((o) => {
    const r = e.indexOf(o);
    return {
      label: o,
      kind: "variable",
      insertText: o,
      detail: r >= 0 ? `Common for @${t.entryType}` : "BibTeX/biblatex field",
      sortText: `${r >= 0 ? `0_${String(r).padStart(3, "0")}` : "1"}_${o}`,
      replaceLength: t.prefix.length
    };
  });
}
function c(t, e) {
  return e.index.getBibEntries(e.document.path).filter((i) => i.key.startsWith(t.prefix)).map((i) => ({
    label: i.key,
    kind: "reference",
    insertText: i.key,
    detail: `@${i.type} · ${i.location.file}:${i.location.line}`,
    documentation: [i.author, i.title, i.year].filter(Boolean).join(" · "),
    replaceLength: t.prefix.length
  }));
}
function b(t, e) {
  const i = new Map(
    e.index.getBibStrings(e.document.path).map((o) => [o.name, o])
  );
  return [.../* @__PURE__ */ new Set([...d, ...i.keys()])].filter((o) => o.startsWith(t.prefix.toLowerCase())).sort().map((o) => {
    const r = i.get(o);
    return {
      label: o,
      kind: "variable",
      insertText: o,
      detail: r ? `@string · ${r.location.file}:${r.location.line}` : "BibTeX month string",
      ...r?.value ? { documentation: r.value } : {},
      sortText: `${r ? "0" : "1"}_${o}`,
      replaceLength: t.prefix.length
    };
  });
}
function h(t) {
  t.registerResolver(
    "bib-entry-type",
    (e) => e.type === "bibtex" ? u(e) : []
  ), t.registerResolver(
    "bib-field",
    (e) => e.type === "bibtex" ? p(e) : []
  ), t.registerResolver(
    "bib-entry-key",
    (e, i) => e.type === "bibtex" ? c(e, i) : []
  ), t.registerResolver(
    "bib-string",
    (e, i) => e.type === "bibtex" ? b(e, i) : []
  );
}
export {
  h as registerBibCompletionResolvers
};
