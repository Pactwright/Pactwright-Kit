/**
 * Documents for the real-model eval (ROADMAP V-12). One English source of 4 pages × 2 sentences,
 * human translations aligned sentence by sentence, and unrelated texts in two target languages.
 * Cases in `cases.ts` are assembled from these, so a label can be checked against the text.
 */

export type Pages = [string, string][];

export const SOURCE_EN: Pages = [
  [
    "The city library opens at nine in the morning from Monday to Saturday.",
    "Members can borrow up to ten books at a time.",
  ],
  ["Books must be returned within three weeks.", "A loan can be renewed twice online or at the front desk."],
  [
    "The reading room on the second floor is reserved for quiet study.",
    "Group work is allowed in the meeting rooms on the ground floor.",
  ],
  [
    "Library cards are free for residents and students.",
    "Visitors can request a temporary card with an identity document.",
  ],
];

export const TRANSLATIONS: Record<string, Pages> = {
  es: [
    [
      "La biblioteca municipal abre a las nueve de la mañana de lunes a sábado.",
      "Los socios pueden tomar prestados hasta diez libros a la vez.",
    ],
    [
      "Los libros deben devolverse en un plazo de tres semanas.",
      "Un préstamo puede renovarse dos veces en línea o en el mostrador de entrada.",
    ],
    [
      "La sala de lectura de la segunda planta está reservada para el estudio en silencio.",
      "El trabajo en grupo está permitido en las salas de reuniones de la planta baja.",
    ],
    [
      "El carné de la biblioteca es gratuito para residentes y estudiantes.",
      "Los visitantes pueden solicitar un carné temporal presentando un documento de identidad.",
    ],
  ],
  fr: [
    [
      "La bibliothèque municipale ouvre à neuf heures du matin, du lundi au samedi.",
      "Les membres peuvent emprunter jusqu'à dix livres à la fois.",
    ],
    [
      "Les livres doivent être rendus dans un délai de trois semaines.",
      "Un prêt peut être renouvelé deux fois en ligne ou à l'accueil.",
    ],
    [
      "La salle de lecture du deuxième étage est réservée à l'étude en silence.",
      "Le travail en groupe est autorisé dans les salles de réunion du rez-de-chaussée.",
    ],
    [
      "La carte de bibliothèque est gratuite pour les résidents et les étudiants.",
      "Les visiteurs peuvent demander une carte temporaire sur présentation d'une pièce d'identité.",
    ],
  ],
  de: [
    [
      "Die Stadtbibliothek öffnet von Montag bis Samstag um neun Uhr morgens.",
      "Mitglieder können bis zu zehn Bücher gleichzeitig ausleihen.",
    ],
    [
      "Bücher müssen innerhalb von drei Wochen zurückgegeben werden.",
      "Eine Ausleihe kann zweimal online oder an der Information verlängert werden.",
    ],
    [
      "Der Lesesaal im zweiten Stock ist für ruhiges Lernen reserviert.",
      "Gruppenarbeit ist in den Besprechungsräumen im Erdgeschoss erlaubt.",
    ],
    [
      "Bibliotheksausweise sind für Einwohner und Studierende kostenlos.",
      "Besucher können mit einem Ausweisdokument einen befristeten Ausweis beantragen.",
    ],
  ],
  // Brazilian Portuguese ("térreo", "pegar emprestado").
  pt: [
    [
      "A biblioteca municipal abre às nove da manhã, de segunda a sábado.",
      "Os sócios podem pegar emprestados até dez livros de cada vez.",
    ],
    [
      "Os livros devem ser devolvidos no prazo de três semanas.",
      "Um empréstimo pode ser renovado duas vezes pela internet ou no balcão de atendimento.",
    ],
    [
      "A sala de leitura do segundo andar é reservada para estudo em silêncio.",
      "O trabalho em grupo é permitido nas salas de reunião do térreo.",
    ],
    [
      "O cartão da biblioteca é gratuito para moradores e estudantes.",
      "Os visitantes podem solicitar um cartão temporário apresentando um documento de identidade.",
    ],
  ],
  it: [
    [
      "La biblioteca comunale apre alle nove del mattino, dal lunedì al sabato.",
      "I soci possono prendere in prestito fino a dieci libri alla volta.",
    ],
    [
      "I libri devono essere restituiti entro tre settimane.",
      "Un prestito può essere rinnovato due volte online o al banco informazioni.",
    ],
    [
      "La sala di lettura al secondo piano è riservata allo studio in silenzio.",
      "Il lavoro di gruppo è consentito nelle sale riunioni al piano terra.",
    ],
    [
      "La tessera della biblioteca è gratuita per i residenti e gli studenti.",
      "I visitatori possono richiedere una tessera temporanea presentando un documento d'identità.",
    ],
  ],
  nl: [
    [
      "De stadsbibliotheek is van maandag tot en met zaterdag om negen uur 's ochtends open.",
      "Leden kunnen maximaal tien boeken tegelijk lenen.",
    ],
    [
      "Boeken moeten binnen drie weken worden teruggebracht.",
      "Een lening kan twee keer online of bij de balie worden verlengd.",
    ],
    [
      "De leeszaal op de tweede verdieping is gereserveerd voor stille studie.",
      "Groepswerk is toegestaan in de vergaderzalen op de begane grond.",
    ],
    [
      "Bibliotheekpasjes zijn gratis voor inwoners en studenten.",
      "Bezoekers kunnen met een identiteitsbewijs een tijdelijke pas aanvragen.",
    ],
  ],
  ja: [
    ["市立図書館は月曜日から土曜日まで、午前九時に開館します。", "会員は一度に十冊まで本を借りることができます。"],
    ["本は三週間以内に返却してください。", "貸出はオンラインまたは受付で二回まで延長できます。"],
    ["二階の閲覧室は静かな学習のために確保されています。", "グループ作業は一階の会議室で行うことができます。"],
    ["図書館カードは住民と学生は無料です。", "来館者は身分証明書を提示して臨時カードを申請できます。"],
  ],
  zh: [
    ["市图书馆周一至周六上午九点开馆。", "会员每次最多可以借十本书。"],
    ["图书必须在三周内归还。", "借阅可以在网上或服务台续借两次。"],
    ["二楼的阅览室专供安静学习使用。", "小组活动可以在一楼的会议室进行。"],
    ["本市居民和学生可免费办理借书证。", "访客可以凭身份证件申请临时借书证。"],
  ],
};

/** Well-formed text in the target language that is not a translation of the source. */
export const UNRELATED: Record<string, Pages> = {
  es: [
    [
      "Para preparar la tortilla, pela cuatro patatas y córtalas en láminas finas.",
      "Pica una cebolla y fríela a fuego lento con aceite de oliva.",
    ],
    [
      "Añade las patatas a la sartén y cocínalas hasta que estén tiernas.",
      "Bate seis huevos en un bol grande con una pizca de sal.",
    ],
    ["Mezcla las patatas escurridas con los huevos batidos.", "Vierte la mezcla en la sartén caliente y cuájala por un lado."],
    ["Dale la vuelta con ayuda de un plato y cocina el otro lado.", "Sirve la tortilla templada, acompañada de pan y ensalada."],
  ],
  fr: [
    [
      "Pour faire une crêpe, mélangez la farine et les œufs dans un saladier.",
      "Ajoutez le lait petit à petit en fouettant pour éviter les grumeaux.",
    ],
    ["Laissez reposer la pâte pendant une heure à température ambiante.", "Faites chauffer une poêle légèrement beurrée à feu moyen."],
    ["Versez une petite louche de pâte et inclinez la poêle pour l'étaler.", "Retournez la crêpe dès que les bords se décollent."],
    ["Garnissez-la de sucre, de confiture ou de chocolat fondu.", "Servez les crêpes chaudes, pliées en quatre."],
  ],
};

/** Renders pages with the `=== Page N ===` markers the rule set's instructions describe. */
export function render(pages: Pages): string {
  return pages.map((sentences, i) => `=== Page ${i + 1} ===\n${sentences.join(" ")}`).join("\n\n");
}
