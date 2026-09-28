# Contract party requirements — inspected 2026-09-28

Status: reference mapping. The user subsequently scoped this project to ID understanding only. Seller/buyer orchestration and contract generation belong to a separate project. The fields below describe the target contract, not this app’s collection scope.
Source: user-supplied blank Model 2026 ITL 054 PDF, page 1, sections (1) and (2). Inspected extracted text, AcroForm fields, widget annotations, and a rendered page. This records the supplied template, not certification of its legal currency. The source PDF is not copied into the public repository.

## Shared seller / buyer record

Each party has 35 fillable fields. Prefix `v_` is seller; `c_` is buyer.

| Group | PDF field suffixes | Extraction / review |
| --- | --- | --- |
| Name or company name | `nume` | MRZ name for individuals; review spelling and diacritics. Company name requires separate input. |
| Home / registered address | `tara`, `judet`, `cod_postal`, `localitate`, `sat_sector`, `strada`, `nr`, `bl`, `sc`, `et`, `ap` | Visual-zone OCR where printed, otherwise manual. No address in MRZ. Postal code requires separate confirmation/input. Keep non-applicable components empty. |
| Identity document | `act_serie`, `act_nr` | Extend extraction to preserve document number and verified format-specific series/number split. Review against printed card; do not invent a series. Also model document type, which is printed as alternatives but has no dedicated PDF widget. |
| Tax identifier | `cnp` | CNP for individuals, CIF/NIF as applicable to other cases. Existing CNP checks must not be applied indiscriminately to company identifiers. |
| Contact | `telefon`, `email` | Manual; telephone/fax and email are not supplied by an ID image. |
| Fiscal address | `df_tara`, `df_judet`, `df_cod_postal`, `df_localitate`, `df_sat_sector`, `df_strada`, `df_nr`, `df_bl`, `df_sc`, `df_et`, `df_ap` | Separate address. Copy home address only after explicit user confirmation that they match. |
| Representative / capacity | `repr_nume`, `repr_act_serie`, `repr_act_nr`, `repr_cif`, `repr_tel`, `repr_email`, `calitate` | Conditional, manually supplied or separately scanned. Template footnote 5 associates representation with legal entities. The printed representative identifier is CIF; preserve that distinction rather than silently treating it as CNP. |

The template does not ask for birth place/date, sex, issuing authority, or document issue/expiry dates in the party sections. Do not collect these solely for output; existing DOB/sex validation can remain internal. Not every blank applies to every party; field presence does not establish mandatory legal status.

## Proposed workflow

1. Select seller or buyer and individual/company. Start implementation with individuals if that scope is confirmed.
2. Read the MRZ for identity and document number; additionally read the visible printed fields needed for the address. Support front/back input without mixing identities.
3. Discard each source after its necessary reads. Retain only structured candidates and field-level source, validation, and review state in memory.
4. Review all extracted fields. Missing/uncertain fields stay explicit; allow manual completion. Do not infer current residence from CNP, nationality, birth place, or issuing authority.
5. Ask for contact details and fiscal-address confirmation. Keep each party's data separate.
6. Future export: map reviewed values to the existing PDF fields, handle document-type alternatives explicitly, and test Romanian diacritics and field overflow. Generate a download only through an explicit export action; a downloaded contract intentionally persists outside browser memory.

## Address limitation

Current CEI cards do not print domicile. A photograph cannot yield chip-only address data. Provide manual entry first; a later optional address-document import could be local too. Do not promise browser NFC/chip access. Official explanation: https://carteadeidentitate.gov.ro/utile/ (questions 6–7), checked 2026-09-28.

## Scope boundaries

Vehicle details, price, contract date/place, signatures, and authority sections are separate from party extraction. Company/representative support and full PDF contract generation remain scope choices, not completed features. Existing English/Romanian, Safari, static hosting, no-processing-network and no-persistence constraints remain in force. General printed-text OCR requires an additional locally hosted model and its own accuracy/privacy tests; the current MRZ-only model does not provide this capability.

## Verified PDF keys

- `v_nume`
- `v_tara`
- `v_judet`
- `v_cod_postal`
- `v_localitate`
- `v_sat_sector`
- `v_strada`
- `v_nr`
- `v_bl`
- `v_sc`
- `v_et`
- `v_ap`
- `v_act_serie`
- `v_act_nr`
- `v_cnp`
- `v_telefon`
- `v_email`
- `v_df_tara`
- `v_df_judet`
- `v_df_cod_postal`
- `v_df_localitate`
- `v_df_sat_sector`
- `v_df_strada`
- `v_df_nr`
- `v_df_bl`
- `v_df_sc`
- `v_df_et`
- `v_df_ap`
- `v_repr_nume`
- `v_repr_act_serie`
- `v_repr_act_nr`
- `v_repr_cif`
- `v_repr_tel`
- `v_repr_email`
- `v_calitate`
- `c_nume`
- `c_tara`
- `c_judet`
- `c_cod_postal`
- `c_localitate`
- `c_sat_sector`
- `c_strada`
- `c_nr`
- `c_bl`
- `c_sc`
- `c_et`
- `c_ap`
- `c_act_serie`
- `c_act_nr`
- `c_cnp`
- `c_telefon`
- `c_email`
- `c_df_tara`
- `c_df_judet`
- `c_df_cod_postal`
- `c_df_localitate`
- `c_df_sat_sector`
- `c_df_strada`
- `c_df_nr`
- `c_df_bl`
- `c_df_sc`
- `c_df_et`
- `c_df_ap`
- `c_repr_nume`
- `c_repr_act_serie`
- `c_repr_act_nr`
- `c_repr_cif`
- `c_repr_tel`
- `c_repr_email`
- `c_calitate`
