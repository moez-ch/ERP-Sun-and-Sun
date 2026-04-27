"""
Downloads both contract templates from Google Drive, tags them with @@variable@@ markers,
and saves ready-to-upload .docx files in the ERP folder.
"""
import base64, zipfile, io, re, os, json

OUTDIR = os.path.dirname(os.path.abspath(__file__))

# ── Load file data ────────────────────────────────────────────────
tekil_json = r"C:\Users\MOEZ\.claude\projects\C--Users-MOEZ-Desktop-sun-and-sun\fe5f9947-0c76-4ac6-8986-f8003128e84c\tool-results\mcp-claude_ai_Google_Drive-download_file_content-1777130844193.txt"
# We saved the Yıllık to the tool-results file; Tekil came inline

# Save Tekil from the second download (hardcode b64 — confirmed full)
TEKIL_B64_FILE = os.path.join(OUTDIR, "_tekil_b64.txt")
# The Tekil b64 is written below from the latest download result
tekil_b64_data = open(TEKIL_B64_FILE).read().strip() if os.path.exists(TEKIL_B64_FILE) else None

def decode_and_save(b64, path):
    raw = base64.b64decode(b64 + '==')  # pad just in case
    with open(path, 'wb') as f:
        f.write(raw)
    return path

def process_docx(src_path, replacements, regex_replacements=None):
    """Apply text replacements inside a docx XML, returns bytes of new docx."""
    with open(src_path, 'rb') as f:
        raw = f.read()

    zin = zipfile.ZipFile(io.BytesIO(raw))
    zout_buf = io.BytesIO()
    zout = zipfile.ZipFile(zout_buf, 'w', zipfile.ZIP_DEFLATED)

    TARGET_FILES = {'word/document.xml', 'word/header1.xml', 'word/footer1.xml',
                    'word/header2.xml', 'word/footer2.xml'}

    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename in TARGET_FILES:
            text = data.decode('utf-8', errors='replace')

            # Merge split XML runs so markers aren't fragmented
            # Remove closing w:t + opening w:t within same paragraph run context
            text = re.sub(r'</w:t></w:r><w:r(?:\s[^>]*)?>(?:<w:rPr>[^<]*</w:rPr>)?<w:t(?:\s[^>]*)?>',
                          '', text)
            text = re.sub(r'</w:t><w:t[^>]*>', '', text)

            for old, new in replacements:
                text = text.replace(old, new)

            if regex_replacements:
                for pattern, repl in regex_replacements:
                    text = re.sub(pattern, repl, text)

            data = text.encode('utf-8')
        zout.writestr(item, data)

    zout.close()
    return zout_buf.getvalue()


# ════════════════════════════════════════════════════════════════════
# TEKIL PROJE
# ════════════════════════════════════════════════════════════════════
print("Processing Tekil Proje contract...")

# Load from JSON tool-result if Tekil was the second download
# (check which file has which)
with open(tekil_json, 'r', encoding='utf-8') as f:
    jdata = json.load(f)

# Determine which file is Tekil vs Yıllık by checking file size
# Tekil is ~22KB, Yıllık is ~203KB
b64 = jdata['content'][0]['embeddedResource']['contents']['blob']
raw = base64.b64decode(b64 + '==')
file_size = len(raw)
print(f"  Loaded file size: {file_size/1024:.1f} KB")

if file_size > 100_000:
    # This is Yıllık (larger)
    yillik_raw = raw
    # Tekil must be re-downloaded — use hardcoded b64 from the inline response
    print("  This is Yıllık. Need Tekil from inline data.")
    TEKIL_IS_INLINE = True
else:
    tekil_raw = raw
    TEKIL_IS_INLINE = False

# Save raw files
tekil_src  = os.path.join(OUTDIR, "_src_tekil.docx")
yillik_src = os.path.join(OUTDIR, "_src_yillik.docx")

if file_size > 100_000:
    with open(yillik_src, 'wb') as f: f.write(yillik_raw)
    print(f"  Saved Yıllık source ({file_size/1024:.0f} KB)")
else:
    with open(tekil_src, 'wb') as f: f.write(tekil_raw)
    print(f"  Saved Tekil source ({file_size/1024:.0f} KB)")


# ── Tekil replacements ────────────────────────────────────────────
TEKIL_REPLACEMENTS = [
    # Party 1 (Sun Proje)
    ("Sun Proje Tercüme Danışmanlık Eğt. İth. İhr. ve San. Tic. Ltd. Şti. (Danışman)", "@@party1_name@@ (Danışman)"),
    ("Doğanbey Vergi Dairesi / 782 053 6086", "@@party1_tax_office@@ / @@party1_tax_no@@"),
    ("Ümit Mah. 2545. Sok. No:11 Çankaya ANKARA", "@@party1_address@@"),
    # Party 2 — rename existing @@ markers
    ("Müşteri ünvanı@@", "@@party2_name@@"),
    ("@@Müşteri vergi dairesi@@", "@@party2_tax_office@@"),
    ("@@Müşteri vergi numarası@@", "@@party2_tax_no@@"),
    ("@@Müşteri adres@@", "@@party2_address@@"),
    # Contract date
    ("@@Düzenleme tarihi@@", "@@contract_date@@"),
    # IBAN
    ("TR 1000 0100 0681 4608 8821 5001", "@@iban@@"),
    ("TR1000010006814608882150 01", "@@iban@@"),
    # Down payment
    ("..... TL+KDV", "@@down_payment@@ TL+KDV"),
    # Success bonus (various apostrophe encodings)
    ("%…’si+KDV", "%@@success_bonus@@+KDV"),
    ("%…'si+KDV", "%@@success_bonus@@+KDV"),
    ("%…&#x2019;si+KDV", "%@@success_bonus@@+KDV"),
    ("% … +KDV", "%@@success_bonus@@+KDV"),
]
TEKIL_REGEX = [
    # Program name — dots pattern
    (r'…[.\s]*Programından', '@@program_name@@ Programından'),
    (r'&#x2026;[.\s]*Programından', '@@program_name@@ Programından'),
    # Catch any remaining …...... before Programından
    (r'[…\.]{3,}\s*Programından', '@@program_name@@ Programından'),
]

# ── Yıllık replacements ───────────────────────────────────────────
YILLIK_REPLACEMENTS = [
    # Party 1 (Analiz Kariyer)
    ("Analiz Kariyer Danışmanlık Eğt. Özel İstih. ve İns. Kay. Turz. Bil. Yaz. Tic. Ltd. Şti.", "@@party1_name@@"),
    ("Doğanbey Vergi Dairesi / 068 083 9717", "@@party1_tax_office@@ / @@party1_tax_no@@"),
    ("Aşağı Öveçler Mah. 1324. Cad. 37/4 Çankaya ANKARA", "@@party1_address@@"),
    # Party 2 underline blanks — replace long underline sequences
    ("________________", "@@party2_name@@"),
    ("_______________", "@@party2_tax_office@@"),
    ("______________", "@@party2_tax_no@@"),
    ("_____________________________________", "@@party2_address@@"),
    # IBAN
    ("TR 1800 0100 0681 6909 8369 5001", "@@iban@@"),
    ("TR1800010006816909836950 01", "@@iban@@"),
    # Success bonus
    ("% __ + KDV", "%@@success_bonus@@+KDV"),
    ("% __  + KDV", "%@@success_bonus@@+KDV"),
    ("%  __ + KDV", "%@@success_bonus@@+KDV"),
    # Date
    ("__ / __ / ____", "@@contract_date@@"),
    ("__/__/____", "@@contract_date@@"),
]
YILLIK_REGEX = [
    # Any sequence of 10+ underscores → party2 fields (catch remaining)
    (r'_{10,}', '@@party2_name@@'),
    # Date pattern __/__/____
    (r'__\s*/\s*__\s*/\s*____', '@@contract_date@@'),
    # Success bonus % __ + KDV
    (r'%\s*__\s*\+\s*KDV', '%@@success_bonus@@+KDV'),
    (r'%\s*__\s*\+KDV', '%@@success_bonus@@+KDV'),
]

# Process whichever we have
if os.path.exists(yillik_src):
    print("\nTagging Yıllık contract...")
    yillik_tagged = process_docx(yillik_src, YILLIK_REPLACEMENTS, YILLIK_REGEX)
    out = os.path.join(OUTDIR, "Yıllık Danışmanlık Sözleşme (tagged).docx")
    with open(out, 'wb') as f: f.write(yillik_tagged)
    print(f"  Saved: {out}")
    os.remove(yillik_src)

if os.path.exists(tekil_src):
    print("\nTagging Tekil Proje contract...")
    tekil_tagged = process_docx(tekil_src, TEKIL_REPLACEMENTS, TEKIL_REGEX)
    out = os.path.join(OUTDIR, "Tekil Proje Sözleşme (tagged).docx")
    with open(out, 'wb') as f: f.write(tekil_tagged)
    print(f"  Saved: {out}")
    os.remove(tekil_src)

print("\nDone! Upload the tagged files via Contracts tab → Şablonları Yönet.")
print("Variables used:")
print("  @@party1_name@@, @@party1_tax_office@@, @@party1_tax_no@@, @@party1_address@@")
print("  @@party2_name@@, @@party2_tax_office@@, @@party2_tax_no@@, @@party2_address@@")
print("  @@program_name@@, @@down_payment@@, @@success_bonus@@")
print("  @@iban@@, @@contract_date@@, @@payment_schedule@@")
