# Organiser inquiry: ready to send (NOT SENT)

Status: **drafted, not sent.** Nothing in this repository sends mail, posts to the forum or contacts the organisers. The owner sends it from their own identity, after filling the bracketed fields. The registration ID is intentionally absent from this public file: add it in the email yourself if you want to.

Why it is needed (see `rules-checklist.md`): on 2026-11-11 the official pages still disagree (`Rules`: "reside in Africa"; `Overview`: "Students only"), a **Manager** replied on the public forum "This hackathon is strictly for students.", and the Overview still lists "At least, a bitcoin/lightning wallet implementation" as a submission item that no organiser has commented on.

**Where to send.** Email: contact@dakarbitcoindays.com (the address behind "Email the hackathon manager" on the Overview). A public question on the Devpost forum (https://dakar-bitcoin-hack-2026.devpost.com/forum_topics) also gets a visible answer, which is useful as a record. Do not post in public anything you are not comfortable having judges read.

**Deadline context.** Submissions close Fri 2026-11-20 3:00 PM EST (20:00 UTC). Send as early as possible; if there is no answer by 2026-11-16, decide on your own risk and record the decision in `submission-checklist.md` section A.

---

## English email

**Subject:** Dakar Bitcoin Hack 2026: eligibility and scope questions before I submit

Hello,

I am preparing a submission to the Dakar Bitcoin Hack 2026 as an **individual** (no company). [Registration ID: ____ ] Before I submit, I would be grateful for written answers to the points below, because the Rules tab and the Overview tab differ.

1. **Eligibility.** The Rules tab says "The participants should reside in Africa." The Overview says "Students only", "Companies/professional organizations excluded from participation" and "All countries/territories, excluding standard exceptions". I saw the Manager's forum reply that the hackathon is "strictly for students". Please confirm which conditions apply, and whether the following qualifies: [country of residence: ____ ; student status and institution: ____ ; age of majority: yes/no]. What are the "standard exceptions"?

2. **Solo entry.** Is an individual entry (no team) allowed?

3. **Wallet requirement.** The Overview's "What to Submit" lists "At least, a bitcoin/lightning wallet implementation"; the Rules tab does not. My project is **not a wallet**. It is payout-authorization software that sits in front of an existing Lightning wallet (it integrates with a self-hosted LND node over its REST API), adds signed multi-person approvals and single-send safety, and produces receipts that can be verified offline. It never holds funds or keys. It is tested on Bitcoin **regtest only** (local test network; no testnet, no mainnet). Is this acceptable under the submission requirements, or is a wallet implementation mandatory? I will describe it accurately as wallet-integrating software, not as a wallet.

4. **Format.** The Rules tab accepts "a MVP accessible through internet (or a demo video)". May I submit a demo video plus a public repository with a one-command local setup instead of a hosted instance? Is a regtest-only prototype acceptable as the MVP? Is there a maximum video length (the Overview mentions a 3-minute demo)?

5. **Open source and IP.** The Overview says "results are open-source". Is any OSI licence acceptable (mine is Apache-2.0), and does the author keep ownership?

6. **AI-assisted development.** Is AI-assisted coding permitted? I will disclose it in the README and on Devpost either way.

7. **Pre-existing work.** My repository history starts on 2026-11-09, inside the submission window. Is there anything else I must disclose about earlier work?

8. **Voting and prizes.** Do the public votes (open until November 24) count toward the three prizes, or only the Popular Choice award? Which prize figures apply (500.000/250.000/100.000 sats on the Rules tab, or $500/$250/$150 in BTC on the Overview), and how and when are prizes paid?

9. **Deadline.** Please confirm the deadline is Friday 2026-11-20 at 3:00 PM EST (20:00 UTC), and whether edits after submission are allowed until then.

Thank you for organising this, and for any clarification.

[Name]
[Country]
[Devpost username]

---

## Version française (courte)

**Objet :** Dakar Bitcoin Hack 2026 : questions d'éligibilité avant ma soumission

Bonjour,

Je prépare une soumission en tant que **particulier** (sans société). [ID d'inscription : ____ ] Les onglets Rules et Overview diffèrent ; pourriez-vous me répondre par écrit ?

1. **Éligibilité** : Rules dit « The participants should reside in Africa » ; Overview dit « Students only », « Companies/professional organizations excluded ». J'ai lu la réponse du Manager sur le forum (« strictly for students »). Mon cas : [pays : ____ ; statut étudiant et établissement : ____ ]. Que sont les « standard exceptions » ?
2. Une participation individuelle (sans équipe) est-elle autorisée ?
3. **Portefeuille** : Overview demande « At least, a bitcoin/lightning wallet implementation ». Mon projet n'est **pas un portefeuille** : c'est un logiciel d'autorisation de paiements qui s'intègre à un portefeuille Lightning existant (nœud LND), n'a jamais la garde des fonds, et est testé uniquement sur **regtest**. Est-ce acceptable ?
4. Une vidéo de démonstration + dépôt public avec installation locale en une commande suffisent-ils à la place d'un MVP hébergé ? Un prototype regtest uniquement est-il accepté ? Durée maximale de la vidéo ?
5. Licence open source (Apache-2.0) acceptée ? L'auteur conserve-t-il la propriété ?
6. Le développement assisté par IA est-il autorisé (je le déclarerai) ?
7. Les votes publics comptent-ils pour les trois prix ? Quels montants et quel mode de paiement ?
8. Confirmez-vous la date limite du vendredi 20 novembre 2026, 15 h EST (20 h UTC) ?

Merci,
[Nom] [Pays]

---

## Short version for Discord/Telegram or the Devpost forum (post only what you are comfortable making public)

> Hi organisers, two quick clarifications please: (1) The Overview says "Students only" and the Rules tab says participants "should reside in Africa": both apply? (2) The Overview lists "At least, a bitcoin/lightning wallet implementation". Is software that integrates with an existing LND wallet (payout approvals, receipts), but is not itself a wallet, acceptable? Also: is a regtest-only prototype with a demo video + public repo OK as the MVP? Thanks!

## Track-fit wording to use if asked (must stay true)

- "Orynt is payout-authorization software. It integrates with a Lightning wallet the organisation already runs (LND, over REST). It is not a wallet and holds no funds or keys."
- "The LND integration is an adapter I wrote and tested on regtest; it is not a new wallet implementation."
- "Not verified: mainnet, testnet, any wallet other than LND, a human security audit, any customer or user."
