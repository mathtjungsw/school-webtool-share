"""Independent in-memory DPAPI/XLSX check; prints aggregate counts only.

Use bundled Python on Windows. Does not write plaintext, restore a live sheet,
or contact Google. The preserved native copy remains the cross-device backup.
"""
import ctypes
from ctypes import wintypes
import hashlib
import io
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile


class Blob(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def unprotect(data):
    buf = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    source = Blob(len(data), buf)
    result = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    crypt.CryptUnprotectData.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p,
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.CryptUnprotectData.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    if not crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise ValueError("DPAPI validation failed")
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        ctypes.memset(result.data, 0, result.size)
        kernel.LocalFree(result.data)


def verify(directory, report_path):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8-sig"))
    report = json.loads(report_path.read_text(encoding="utf-8-sig"))
    encrypted = (directory / "source.xlsx.dpapi").read_bytes()
    clear = unprotect(encrypted)
    assert len(clear) == manifest["bytes"] == report["backupBytes"]
    assert hashlib.sha256(clear).hexdigest() == manifest["sha256"] == report["backupSha256"]
    altered = bytearray(encrypted)
    altered[-10] ^= 1
    try:
        unprotect(altered)
    except ValueError:
        pass
    else:
        raise AssertionError("Corrupted encrypted data was accepted")
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(clear)) as archive:
        assert archive.testzip() is None
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", ns):
                strings.append("".join(t.text or "" for t in item.findall(".//s:t", ns)))
        rels = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        sheets = ET.fromstring(archive.read("xl/workbook.xml")).findall("s:sheets/s:sheet", ns)
        assert len(sheets) == report["sheetCount"] == len(report["sheets"])
        total_rows = 0
        for sheet, expected in zip(sheets, report["sheets"]):
            if expected["classified"]:
                assert sheet.attrib["name"] == expected["sheetName"]
            rel = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rels[rel]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            cells = formulas = rows = 0
            for row in ET.fromstring(archive.read(target)).findall("s:sheetData/s:row", ns):
                populated = False
                for cell in row.findall("s:c", ns):
                    value = cell.findtext("s:v", "", ns)
                    kind = cell.attrib.get("t", "n")
                    if kind == "s":
                        value = strings[int(value)]
                    elif kind == "inlineStr":
                        value = "".join(t.text or "" for t in cell.findall("s:is//s:t", ns))
                    formula = cell.find("s:f", ns) is not None
                    if value != "" or formula:
                        cells += 1
                        formulas += formula
                        populated = True
                if int(row.attrib["r"]) > 1 and populated:
                    rows += 1
            assert (rows, cells, formulas) == (expected["dataRows"], expected["populatedCells"], expected["formulaCells"])
            total_rows += rows
    print(f"Independent verification passed: {len(sheets)} sheets, {total_rows} data rows; SHA256, ZIP CRC, counts and ciphertext tamper rejection verified.")


if __name__ == "__main__":
    try:
        verify(Path(sys.argv[1]), Path(sys.argv[2]))
    except Exception:
        # Never expose workbook contents or authenticated/raw exception text.
        print("Backup verification failed; details intentionally omitted.", file=sys.stderr)
        sys.exit(1)
