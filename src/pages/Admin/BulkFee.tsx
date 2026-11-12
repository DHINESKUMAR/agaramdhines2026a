import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { 
  getStudents, 
  saveStudents, 
  getFees, 
  saveFees, 
  getClasses, 
  getAdminSettings 
} from "../../lib/db";
import { matchesPhoneSearch, normalizePhone } from "../../lib/phoneUtils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  Download, 
  RefreshCw, 
  DollarSign, 
  Users, 
  Calendar, 
  CreditCard, 
  Trash2, 
  Printer, 
  ArrowRight,
  ClipboardPaste,
  Search,
  Check,
  ChevronRight,
  Info
} from "lucide-react";

interface ParsedRow {
  id: string;
  rawName: string;
  rawPhone: string;
  rawRollNumber: string;
  rawPayment: number | string;
  matchedStudent: any | null;
  matchType: "roll" | "phone" | "name" | "manual" | "none";
  alreadyPaidThisMonth: boolean;
  selected: boolean;
  error?: string;
}

export default function BulkFee() {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [existingFees, setExistingFees] = useState<any[]>([]);
  const [adminSettings, setAdminSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Batch Payment Configuration
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  });
  const [paymentDate, setPaymentDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [paymentMethod, setPaymentMethod] = useState<string>("Bank Transfer");
  const [feeCategory, setFeeCategory] = useState<string>("Monthly Fee");
  const [feeItemName, setFeeItemName] = useState<string>("Monthly Tuition Fee (மாதாந்த கட்டணம்)");
  const [batchNote, setBatchNote] = useState<string>("");

  // Input State
  const [activeInputTab, setActiveInputTab] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsed Data & Processing
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "matched" | "unmatched" | "already_paid">("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedBatchResult, setProcessedBatchResult] = useState<{
    batchId: string;
    totalCount: number;
    totalAmount: number;
    date: string;
    month: string;
    records: any[];
  } | null>(null);

  // Load Initial Data
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [stuData, classData, feeData, settingsData] = await Promise.all([
        getStudents(),
        getClasses(),
        getFees(),
        getAdminSettings()
      ]);
      setStudents(stuData || []);
      setClasses(classData || []);
      setExistingFees(feeData || []);
      setAdminSettings(settingsData || null);
    } catch (err) {
      console.error("Error loading initial data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Helper: Normalize roll numbers for comparison
  const normalizeRoll = (roll: any): string => {
    if (!roll) return "";
    return String(roll)
      .trim()
      .toLowerCase()
      .replace(/[\s\-_]/g, "")
      .replace(/\/+/g, "/");
  };

  // Helper: Match a parsed row to existing students
  const matchStudent = (
    rollNo: string,
    phone: string,
    name: string,
    allStudents: any[]
  ): { student: any | null; matchType: "roll" | "phone" | "name" | "none" } => {
    const normSearchRoll = normalizeRoll(rollNo);
    const normSearchPhone = normalizePhone(phone);
    const normSearchName = (name || "").trim().toLowerCase();

    // 1. Primary Match: Roll Number (highest priority)
    if (normSearchRoll) {
      const byRoll = allStudents.find(s => {
        const sRoll = normalizeRoll(s.rollNo || s.username || s.student_id || s.id);
        return sRoll && (sRoll === normSearchRoll || sRoll.includes(normSearchRoll) || normSearchRoll.includes(sRoll));
      });
      if (byRoll) return { student: byRoll, matchType: "roll" };
    }

    // 2. Secondary Match: Phone Number
    if (normSearchPhone && normSearchPhone.length >= 7) {
      const byPhone = allStudents.find(s => {
        return (
          matchesPhoneSearch(s.phone, phone) ||
          matchesPhoneSearch(s.whatsapp, phone) ||
          matchesPhoneSearch(s.mobile, phone)
        );
      });
      if (byPhone) return { student: byPhone, matchType: "phone" };
    }

    // 3. Tertiary Match: Exact / Normalized Student Name
    if (normSearchName && normSearchName.length >= 3) {
      const byName = allStudents.find(s => {
        const sName = (s.name || "").trim().toLowerCase();
        return sName === normSearchName;
      });
      if (byName) return { student: byName, matchType: "name" };
    }

    return { student: null, matchType: "none" };
  };

  // Helper: Check if student has already paid for the selected month
  const checkAlreadyPaid = (studentId: string, month: string): boolean => {
    if (!studentId || !month) return false;
    const normMonth = month.trim().toLowerCase();
    return existingFees.some((f: any) => {
      const fStuId = String(f.studentId || f.student_id || "");
      const fMonth = String(f.month || "").trim().toLowerCase();
      return fStuId === String(studentId) && fMonth === normMonth && (parseFloat(f.amount) || 0) > 0;
    });
  };

  // Parse raw row objects into ParsedRow items
  const processRawDataRows = (rows: any[]) => {
    if (!rows || rows.length === 0) {
      alert("எந்த தகவலும் கண்டறியப்படவில்லை. (No data found)");
      return;
    }

    const processed: ParsedRow[] = rows.map((r, idx) => {
      // Find matching keys case-insensitively
      const keys = Object.keys(r);
      const getKey = (patterns: string[]): any => {
        for (const p of patterns) {
          const matchKey = keys.find(k => k.trim().toLowerCase() === p.toLowerCase() || k.trim().toLowerCase().includes(p.toLowerCase()));
          if (matchKey && r[matchKey] !== undefined && r[matchKey] !== null) {
            return r[matchKey];
          }
        }
        return "";
      };

      const rawName = String(getKey(["name", "student name", "student_name", "பெயர்", "மாணவர் பெயர்"])).trim();
      const rawPhone = String(getKey(["phone", "mobile", "tel", "whatsapp", "தொலைபேசி"])).trim();
      const rawRoll = String(getKey(["roll number", "roll no", "rollno", "roll_no", "reg no", "ரோல் எண்"])).trim();
      
      let rawPaymentVal = getKey(["payment", "amount", "fee", "paid", "கட்டணம்", "தொகை"]);
      let numPayment = 0;
      if (typeof rawPaymentVal === "number") {
        numPayment = rawPaymentVal;
      } else {
        const cleanedStr = String(rawPaymentVal).replace(/[^\d.]/g, "");
        numPayment = parseFloat(cleanedStr) || 0;
      }

      const { student, matchType } = matchStudent(rawRoll, rawPhone, rawName, students);
      const isAlreadyPaid = student ? checkAlreadyPaid(student.id || student.student_id, selectedMonth) : false;

      return {
        id: `row-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        rawName,
        rawPhone,
        rawRollNumber: rawRoll,
        rawPayment: numPayment,
        matchedStudent: student,
        matchType,
        alreadyPaidThisMonth: isAlreadyPaid,
        selected: student !== null // Auto select if matched
      };
    });

    setParsedRows(processed);
  };

  // 1. File Upload Handler (.xlsx, .xls, .csv)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!data || data.length === 0) {
          alert("தேர்ந்தெடுக்கப்பட்ட எக்செல் கோப்பில் எந்த தகவலும் இல்லை.");
          return;
        }

        processRawDataRows(data);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err: any) {
        console.error("Excel parse error:", err);
        alert("எக்செல் கோப்பைப் படிப்பதில் பிழை: " + (err?.message || err));
      }
    };
    reader.readAsBinaryString(file);
  };

  // 2. Direct Clipboard Paste Handler (Tab / Comma separated)
  const handlePasteSubmit = () => {
    if (!pastedText.trim()) {
      alert("தயவுசெய்து எக்செல் வரிகளைப் பேஸ்ட் செய்யவும். (Please paste Excel rows)");
      return;
    }

    const lines = pastedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      alert("வரிகள் எதுவும் கண்டறியப்படவில்லை.");
      return;
    }

    // Check if the first line is header
    const firstLineLower = lines[0].toLowerCase();
    const hasHeader = firstLineLower.includes("roll") || 
                      firstLineLower.includes("name") || 
                      firstLineLower.includes("phone") || 
                      firstLineLower.includes("pay");

    const dataLines = hasHeader ? lines.slice(1) : lines;

    const parsedData = dataLines.map(line => {
      // Split by tab (default from Excel) or comma
      let cols = line.split("\t");
      if (cols.length === 1 && line.includes(",")) {
        cols = line.split(",");
      }
      cols = cols.map(c => c.trim());

      // Expected Column Order matching user's Excel screenshot:
      // Col 0: Name
      // Col 1: Phone
      // Col 2: Roll Number
      // Col 3: Payment
      return {
        Name: cols[0] || "",
        Phone: cols[1] || "",
        "Roll Number": cols[2] || "",
        payment: cols[3] || ""
      };
    });

    processRawDataRows(parsedData);
    setPastedText("");
  };

  // Manual student re-link for unmatched rows
  const handleManualLinkStudent = (rowId: string, studentId: string) => {
    const student = students.find(s => String(s.id || s.student_id) === String(studentId));
    if (!student) return;

    setParsedRows(prev => prev.map(r => {
      if (r.id === rowId) {
        const isPaid = checkAlreadyPaid(student.id || student.student_id, selectedMonth);
        return {
          ...r,
          matchedStudent: student,
          matchType: "manual",
          alreadyPaidThisMonth: isPaid,
          selected: true
        };
      }
      return r;
    }));
  };

  // Edit payment amount inline
  const handlePaymentAmountChange = (rowId: string, newAmount: number) => {
    setParsedRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return { ...r, rawPayment: newAmount };
      }
      return r;
    }));
  };

  // Toggle selection
  const handleToggleRowSelection = (rowId: string) => {
    setParsedRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return { ...r, selected: !r.selected };
      }
      return r;
    }));
  };

  const handleSelectAllMatched = () => {
    setParsedRows(prev => prev.map(r => {
      if (r.matchedStudent) {
        return { ...r, selected: true };
      }
      return r;
    }));
  };

  const handleDeselectAll = () => {
    setParsedRows(prev => prev.map(r => ({ ...r, selected: false })));
  };

  // Clear all parsed rows
  const handleClearAllRows = () => {
    if (parsedRows.length === 0) return;
    if (window.confirm("பகுப்பாய்வு செய்யப்பட்ட அனைத்து வரிகளையும் நீக்க விரும்புகிறீர்களா?")) {
      setParsedRows([]);
    }
  };

  // Download Sample Excel Template exactly matching user's image
  const handleDownloadSampleExcel = () => {
    const sampleData = [
      {
        "Name": "Mufaris fathima reeha",
        "Phone": "+94 77 567 0739",
        "Roll Number": "2026/SEM/B1/1901",
        "payment": 2500
      },
      {
        "Name": "K. Dinesh",
        "Phone": "0778054232",
        "Roll Number": "2026/SEM/B1/1902",
        "payment": 2500
      },
      {
        "Name": "S. Pooja",
        "Phone": "+94 77 470 0071",
        "Roll Number": "2026/SEM/B1/1903",
        "payment": 2500
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    
    // Style column widths
    ws["!cols"] = [
      { wch: 26 }, // Name
      { wch: 18 }, // Phone
      { wch: 22 }, // Roll Number
      { wch: 14 }  // payment
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bulk_Fee_Sample");
    XLSX.writeFile(wb, "Bulk_Payment_Sample_Template.xlsx");
  };

  // Process & Commit Bulk Payments into DB
  const handleProcessBulkPayments = async () => {
    const selectedRows = parsedRows.filter(r => r.selected && r.matchedStudent);
    if (selectedRows.length === 0) {
      alert("பதிவு செய்வதற்கு மாணவர்கள் எவரும் தெரிவு செய்யப்படவில்லை. (No matched students selected)");
      return;
    }

    const invalidAmountRows = selectedRows.filter(r => (parseFloat(String(r.rawPayment)) || 0) <= 0);
    if (invalidAmountRows.length > 0) {
      if (!window.confirm(`${invalidAmountRows.length} மாணவர்களுக்கு கட்டணத் தொகை 0 அல்லது தவறாக உள்ளது. தொடரலாமா?`)) {
        return;
      }
    }

    const confirmMsg = `தேர்வு செய்யப்பட்ட ${selectedRows.length} மாணவர்களுக்கான ${selectedMonth} மாத கட்டணங்களை பல்க்காக பதிவு செய்ய விரும்புகிறீர்களா?\n\n• மொத்த மாணவர்கள்: ${selectedRows.length}\n• மாதம்: ${selectedMonth}\n• பணம் செலுத்திய தேதி: ${paymentDate}\n• முறை: ${paymentMethod}`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsProcessing(true);
      const currentFees = await getFees() || [];
      const batchId = `BATCH-BULK-${Date.now()}`;
      const newFeeRecords: any[] = [];
      let totalSum = 0;

      selectedRows.forEach((row, idx) => {
        const student = row.matchedStudent;
        const amountNum = parseFloat(String(row.rawPayment)) || 0;
        totalSum += amountNum;

        const txnId = `TXN-BULK-${Date.now().toString().slice(-6)}-${idx + 1}`;

        newFeeRecords.push({
          id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          studentId: student.id || student.student_id,
          studentName: student.name,
          grade: student.grade || "General",
          rollNo: student.rollNo || row.rawRollNumber || "",
          month: selectedMonth,
          amount: String(amountNum),
          fullFee: String(amountNum),
          discount: "0",
          discountReason: "",
          discountType: "fixed",
          discountValue: "0",
          netFee: String(amountNum),
          remainingAmount: "0",
          method: paymentMethod,
          date: paymentDate,
          type: feeCategory,
          category: feeCategory,
          itemName: feeItemName,
          transactionId: txnId,
          batchId: batchId,
          batchMonths: [selectedMonth],
          batchMonthsFormatted: selectedMonth,
          batchMonthCount: 1,
          timestamp: new Date().toISOString(),
          batchFullFee: String(amountNum),
          batchSubTotal: String(amountNum),
          batchDiscount: "0",
          batchDiscountType: "fixed",
          batchDiscountValue: "0",
          batchDiscountReason: "",
          batchNetPayable: String(amountNum),
          batchAmountPaid: String(amountNum),
          batchRemaining: "0",
          note: batchNote || `Bulk upload via Excel: ${row.rawRollNumber}`
        });
      });

      // Save to fees DB
      const updatedFees = [...currentFees, ...newFeeRecords];
      await saveFees(updatedFees);
      setExistingFees(updatedFees);

      // Unblock zoom access automatically for all paid students
      const allStudents = await getStudents();
      const paidStudentIds = new Set(selectedRows.map(r => String(r.matchedStudent.id || r.matchedStudent.student_id)));
      const updatedStudents = allStudents.map(s => {
        const sId = String(s.id || s.student_id);
        if (paidStudentIds.has(sId)) {
          return { ...s, zoomBlocked: false };
        }
        return s;
      });
      await saveStudents(updatedStudents);
      setStudents(updatedStudents);

      // Record batch result for immediate report/print
      setProcessedBatchResult({
        batchId,
        totalCount: newFeeRecords.length,
        totalAmount: totalSum,
        date: paymentDate,
        month: selectedMonth,
        records: newFeeRecords
      });

      // Remove successfully processed rows from view
      setParsedRows(prev => prev.filter(r => !selectedRows.some(sr => sr.id === r.id)));

      alert(`வெற்றிகரமாக ${newFeeRecords.length} மாணவர்களுக்கான கட்டணங்கள் பதிவு செய்யப்பட்டன!\nமொத்தத் தொகை: ரூ. ${totalSum.toLocaleString()}`);
    } catch (err: any) {
      console.error("Bulk fee processing error:", err);
      alert("கட்டணம் பதிவதில் பிழை: " + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  // Export processed batch to Excel
  const handleExportBatchExcel = () => {
    if (!processedBatchResult) return;

    const exportRows = processedBatchResult.records.map((r, idx) => ({
      "வ. எண்": idx + 1,
      "ரோல் எண் (Roll No)": r.rollNo,
      "மாணவர் பெயர் (Name)": r.studentName,
      "வகுப்பு (Grade)": r.grade,
      "மாதம் (Month)": r.month,
      "செலுத்திய தொகை (Rs.)": Number(r.amount),
      "தேதி (Date)": r.date,
      "பரிமாற்ற எண் (Txn ID)": r.transactionId,
      "முறை (Method)": r.method
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bulk_Payment_Receipts");
    XLSX.writeFile(wb, `Bulk_Fee_Report_${processedBatchResult.month.replace(/\s+/g, "_")}.xlsx`);
  };

  // Export processed batch to PDF
  const handleExportBatchPDF = () => {
    if (!processedBatchResult) return;

    const doc = new jsPDF("p", "mm", "a4");

    // Academy Header
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(adminSettings?.academyName || "AGARAM DHINESH ONLINE ACADEMY", 14, 16);

    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.text(`பல்க் கட்டண அறிக்கை (Bulk Fee Payment Report) - ${processedBatchResult.month}`, 14, 23);

    doc.setFontSize(9);
    doc.text(`தேதி: ${processedBatchResult.date}  |  மொத்த மாணவர்கள்: ${processedBatchResult.totalCount}  |  மொத்தத் தொகை: ரூ. ${processedBatchResult.totalAmount.toLocaleString()}`, 14, 29);

    const tableData = processedBatchResult.records.map((r, idx) => [
      String(idx + 1),
      r.rollNo || "-",
      r.studentName || "-",
      r.grade || "-",
      `Rs. ${Number(r.amount).toLocaleString()}`,
      r.transactionId || "-"
    ]);

    autoTable(doc, {
      startY: 33,
      head: [["#", "Roll No", "Student Name", "Grade", "Amount (LKR)", "Txn ID"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`Bulk_Fee_Report_${processedBatchResult.month.replace(/\s+/g, "_")}.pdf`);
  };

  // Filter parsed rows
  const filteredRows = parsedRows.filter(r => {
    // Status filter
    if (statusFilter === "matched" && !r.matchedStudent) return false;
    if (statusFilter === "unmatched" && r.matchedStudent) return false;
    if (statusFilter === "already_paid" && !r.alreadyPaidThisMonth) return false;

    // Search filter
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchRoll = r.rawRollNumber.toLowerCase().includes(q);
      const matchName = r.rawName.toLowerCase().includes(q);
      const matchPhone = r.rawPhone.includes(q);
      const matchStudentName = r.matchedStudent?.name?.toLowerCase().includes(q);
      return matchRoll || matchName || matchPhone || matchStudentName;
    }

    return true;
  });

  // Calculate statistics
  const totalParsedCount = parsedRows.length;
  const matchedCount = parsedRows.filter(r => r.matchedStudent).length;
  const unmatchedCount = parsedRows.filter(r => !r.matchedStudent).length;
  const selectedCount = parsedRows.filter(r => r.selected && r.matchedStudent).length;
  const totalSelectedAmount = parsedRows
    .filter(r => r.selected && r.matchedStudent)
    .reduce((sum, r) => sum + (parseFloat(String(r.rawPayment)) || 0), 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-gradient-to-tr from-emerald-600 to-teal-700 text-white rounded-2xl flex items-center justify-center shadow-md shadow-emerald-600/20">
              <DollarSign size={26} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                  Bulk Fee Payment / பல்க் கட்டணம் பதிவேற்றம்
                </h1>
                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Excel Import
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                எக்செல் (Excel) மூலம் மாணவர்களின் ரோல் எண்ணை (Roll Number) தானாக சரிபார்த்து ஒரே நேரத்தில் பல்க் கட்டணங்களை பதிவு செய்தல்
              </p>
            </div>
          </div>

          {/* Quick Actions & Navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadSampleExcel}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer border border-slate-300"
              title="எக்செல் மாதிரி படிவத்தை பதிவிறக்க (Download Sample Template)"
            >
              <Download size={15} className="text-emerald-600" />
              <span>மாதிரி Excel படிவம்</span>
            </button>

            <Link
              to="/admin/collect-fee"
              className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors border border-blue-200"
            >
              <CreditCard size={15} />
              <span>Collect Fee</span>
            </Link>

            <Link
              to="/admin/fees"
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-xs"
            >
              <span>Manage Fees</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Batch Payment Global Settings Card */}
      <div className="bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white rounded-2xl p-5 border border-emerald-200/80 shadow-xs">
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-emerald-100">
          <Calendar size={18} className="text-emerald-700" />
          <h2 className="text-sm font-black text-emerald-950 uppercase tracking-wider">
            1. பல்க் கட்டண விபரங்கள் (Batch Settings)
          </h2>
          <span className="text-[11px] text-emerald-700 ml-auto font-medium">
            *இந்த அமைப்புகள் அனைத்து மாணவர்களுக்கும் பொருந்தும்
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Month Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              கட்டண மாதம் (Month) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              placeholder="e.g. April 2026"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-emerald-600 focus:border-emerald-600"
            />
            <div className="flex gap-1 mt-1">
              {["April 2026", "May 2026", "June 2026"].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonth(m)}
                  className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                    selectedMonth === m ? "bg-emerald-600 text-white font-bold" : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {m.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              செலுத்தப்பட்ட தேதி (Date) <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-emerald-600 focus:border-emerald-600"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              செலுத்தும் முறை (Payment Method)
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-emerald-600 focus:border-emerald-600 cursor-pointer"
            >
              <option value="Bank Transfer">Bank Transfer (வங்கி பரிமாற்றம்)</option>
              <option value="Cash">Cash (நேரடி பணம்)</option>
              <option value="Online">Online Payment</option>
              <option value="Card">Card</option>
              <option value="Slip Deposit">Bank Slip Deposit</option>
            </select>
          </div>

          {/* Fee Category */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              கட்டண வகை (Fee Category)
            </label>
            <select
              value={feeCategory}
              onChange={(e) => setFeeCategory(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-emerald-600 focus:border-emerald-600 cursor-pointer"
            >
              <option value="Monthly Fee">Monthly Fee (மாதாந்த கட்டணம்)</option>
              <option value="Course Fee">Course Fee (பாடக் கட்டணம்)</option>
              <option value="Term Fee">Term Fee (தவணை கட்டணம்)</option>
              <option value="Special Class">Special Class (விசேட வகுப்பு)</option>
            </select>
          </div>

          {/* Fee Item Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              கட்டண விளக்கம் (Item Name)
            </label>
            <input
              type="text"
              value={feeItemName}
              onChange={(e) => setFeeItemName(e.target.value)}
              placeholder="e.g. Monthly Tuition Fee"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-emerald-600 focus:border-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* Input Methods: File Upload or Direct Excel Paste */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50/70">
          <button
            onClick={() => setActiveInputTab("file")}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-black transition-all cursor-pointer ${
              activeInputTab === "file"
                ? "bg-white text-emerald-700 border-b-2 border-emerald-600 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Upload size={16} />
            <span>2. Excel / CSV கோப்பைப் பதிவேற்று (Upload Excel File)</span>
          </button>

          <button
            onClick={() => setActiveInputTab("paste")}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-black transition-all cursor-pointer ${
              activeInputTab === "paste"
                ? "bg-white text-emerald-700 border-b-2 border-emerald-600 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <ClipboardPaste size={16} />
            <span>Excel-லிருந்து நேரடியாக பேஸ்ட் செய் (Copy & Paste from Excel)</span>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {activeInputTab === "file" ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-300 bg-emerald-50/30 rounded-2xl p-8 hover:bg-emerald-50/60 transition-colors">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mb-3">
                <FileSpreadsheet size={30} />
              </div>
              <h3 className="text-base font-black text-slate-800 text-center">
                உங்கள் Excel (.xlsx, .xls) அல்லது CSV கோப்பை இங்கு பதிவேற்றவும்
              </h3>
              <p className="text-xs text-slate-500 text-center mt-1 max-w-lg font-medium">
                எக்செல் தலைப்புகள்: <span className="font-bold text-slate-800 bg-amber-100 px-1.5 py-0.5 rounded">Name</span> |{" "}
                <span className="font-bold text-slate-800 bg-amber-100 px-1.5 py-0.5 rounded">Phone</span> |{" "}
                <span className="font-bold text-slate-800 bg-amber-100 px-1.5 py-0.5 rounded">Roll Number</span> |{" "}
                <span className="font-bold text-slate-800 bg-amber-100 px-1.5 py-0.5 rounded">payment</span>
              </p>

              <label className="mt-5 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-2.5 rounded-xl text-xs shadow-md shadow-emerald-600/30 transition-all cursor-pointer">
                <Upload size={16} />
                <span>Excel கோப்பைத் தேர்வு செய்க (Choose File)</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleDownloadSampleExcel}
                className="mt-3 text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Download size={13} /> மாதிரி எக்செல் கோப்பைப் பதிவிறக்க (Download Sample File)
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  எக்செல் வரிகளை இங்கு பேஸ்ட் செய்யவும் (Paste rows from Excel):
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  எக்செல் அட்டவணையில் உள்ள வரிகளை காப்பி செய்து (`Ctrl + C`) கீழே உள்ள பெட்டியில் பேஸ்ட் (`Ctrl + V`) செய்யலாம்.
                </p>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Name\tPhone\tRoll Number\tpayment\nMufaris fathima reeha\t+94 77 567 0739\t2026/SEM/B1/1901\t2500\nK. Dinesh\t0778054232\t2026/SEM/B1/1902\t2500`}
                  rows={6}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-emerald-600 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleDownloadSampleExcel}
                  className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Download size={14} /> மாதிரி வடிவம் தேவைப்பட்டால் பார்க்கவும்
                </button>

                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  <Check size={16} />
                  <span>வரிகளைப் பகுப்பாய்வு செய்க (Parse & Match)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Parsed Rows Verification & Confirmation Table */}
      {parsedRows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-4 p-5">
          {/* Header Stats Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                <span>3. சரிபார்த்தல் & உறுதிப்படுத்தல் (Preview & Verification)</span>
                <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                  {totalParsedCount} வரிகள்
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                மாணவர்களின் விபரங்கள் கணினியில் உள்ள அசல் தரவுகளுடன் ஒப்பிடப்பட்டு காட்டப்படுகின்றன.
              </p>
            </div>

            {/* Quick Metrics Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <CheckCircle size={14} className="text-emerald-600" />
                பொருந்தியது: {matchedCount}
              </span>

              {unmatchedCount > 0 && (
                <span className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                  <XCircle size={14} className="text-rose-600" />
                  பொருந்தவில்லை: {unmatchedCount}
                </span>
              )}

              <span className="bg-blue-50 border border-blue-200 text-blue-800 text-xs font-black px-3 py-1.5 rounded-xl">
                தெரிவு: {selectedCount} | மொத்தம்: ரூ. {totalSelectedAmount.toLocaleString()}
              </span>

              <button
                type="button"
                onClick={handleClearAllRows}
                className="text-xs text-slate-500 hover:text-rose-600 p-1.5 rounded-lg border border-slate-200 hover:border-rose-300 transition-colors"
                title="அனைத்தையும் அழிக்க"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Filter & Action Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Search filter */}
              <div className="relative flex-1 sm:w-64">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="ரோல் எண் / பெயர் தேட..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-emerald-600 focus:bg-white"
                />
              </div>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-700 cursor-pointer"
              >
                <option value="all">அனைத்தும் ({totalParsedCount})</option>
                <option value="matched">பொருந்தியவை ({matchedCount})</option>
                <option value="unmatched">பொருந்தாதவை ({unmatchedCount})</option>
                <option value="already_paid">ஏற்கனவே கட்டியவை</option>
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleSelectAllMatched}
                className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl cursor-pointer transition-colors"
              >
                பொருந்திய அனைத்தையும் தெரிவுசெய்
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl cursor-pointer transition-colors"
              >
                அனைத்தையும் நீக்கு
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white font-black text-[11px] uppercase tracking-wider">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedCount === matchedCount && matchedCount > 0}
                      onChange={(e) => e.target.checked ? handleSelectAllMatched() : handleDeselectAll()}
                      className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">வ.எண்</th>
                  <th className="p-3">Excel Roll Number</th>
                  <th className="p-3">Excel பெயர் & போன்</th>
                  <th className="p-3">கணினியில் மாணவர் (System Match)</th>
                  <th className="p-3 text-right">கட்டணத் தொகை (Payment)</th>
                  <th className="p-3 text-center">நிலை (Status)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, idx) => {
                  const student = row.matchedStudent;
                  const isMatched = student !== null;

                  return (
                    <tr 
                      key={row.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !isMatched ? "bg-rose-50/30" : row.alreadyPaidThisMonth ? "bg-amber-50/30" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={!isMatched}
                          onChange={() => handleToggleRowSelection(row.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 disabled:opacity-30 cursor-pointer"
                        />
                      </td>

                      <td className="p-3 font-mono text-slate-500 font-bold">
                        {idx + 1}
                      </td>

                      <td className="p-3 font-mono font-black text-slate-900">
                        {row.rawRollNumber || <span className="text-slate-400 italic">No Roll No</span>}
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-slate-800">{row.rawName || "-"}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{row.rawPhone || "-"}</div>
                      </td>

                      <td className="p-3">
                        {isMatched ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-black text-[11px] flex items-center justify-center">
                              {student.name?.charAt(0) || "S"}
                            </div>
                            <div>
                              <div className="font-black text-slate-900 flex items-center gap-1.5">
                                <span>{student.name}</span>
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                                  {student.grade}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Roll: <span className="font-mono font-bold text-slate-700">{student.rollNo || "N/A"}</span>
                                {student.phone && ` • Tel: ${student.phone}`}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="text-rose-600 text-xs font-bold">
                              மாணவர் கண்டறியப்படவில்லை.
                            </div>
                            {/* Dropdown to manually pick a student */}
                            <select
                              onChange={(e) => handleManualLinkStudent(row.id, e.target.value)}
                              defaultValue=""
                              className="text-[11px] bg-white border border-rose-300 rounded-lg px-2 py-1 text-slate-700 max-w-[200px] cursor-pointer"
                            >
                              <option value="" disabled>மாணவரைத் தெரிவு செய்...</option>
                              {students.map(s => (
                                <option key={s.id || s.student_id} value={s.id || s.student_id}>
                                  {s.rollNo} - {s.name} ({s.grade})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1 font-mono font-black text-slate-900">
                          <span className="text-slate-400 text-xs">Rs.</span>
                          <input
                            type="number"
                            value={row.rawPayment}
                            onChange={(e) => handlePaymentAmountChange(row.id, parseFloat(e.target.value) || 0)}
                            className="w-24 text-right bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 font-bold focus:outline-emerald-600 focus:bg-white"
                          />
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        {isMatched ? (
                          row.alreadyPaidThisMonth ? (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full" title="இந்த மாணவருக்கு இந்த மாதக் கட்டணம் ஏற்கனவே உள்ளது">
                              <AlertTriangle size={12} />
                              ஏற்கனவே உள்ளது
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                              <CheckCircle size={12} />
                              தயார் (Ready)
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                            <XCircle size={12} />
                            பொருந்தவில்லை
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Confirmation Sticky Action Bar */}
          <div className="sticky bottom-4 z-20 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-700">
            <div>
              <div className="text-sm font-black flex items-center gap-2">
                <CreditCard size={18} className="text-emerald-400" />
                <span>தேர்வு செய்யப்பட்டவை: {selectedCount} மாணவர்கள்</span>
                <span className="text-slate-400 font-normal">|</span>
                <span className="text-emerald-300">மொத்தத் தொகை: ரூ. {totalSelectedAmount.toLocaleString()}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                மாதம்: <span className="text-white font-bold">{selectedMonth}</span> • 
                தேதி: <span className="text-white font-bold">{paymentDate}</span> • 
                முறை: <span className="text-white font-bold">{paymentMethod}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleProcessBulkPayments}
                disabled={isProcessing || selectedCount === 0}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:opacity-50 text-white font-black px-6 py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>பதிவு செய்யப்படுகிறது...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span>பல்க் கட்டணங்களை பதிவு செய் ({selectedCount})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Processed Batch Success Card */}
      {processedBatchResult && (
        <div className="bg-emerald-900 text-white rounded-2xl p-6 shadow-xl space-y-4 border border-emerald-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white">
                <CheckCircle size={28} />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight text-white">
                  பல்க் கட்டணங்கள் வெற்றிகரமாகப் பதிவு செய்யப்பட்டன!
                </h3>
                <p className="text-xs text-emerald-200">
                  {processedBatchResult.month} மாதத்திற்காக {processedBatchResult.totalCount} மாணவர்களின் கட்டணங்கள் அமைப்பில் சேர்க்கப்பட்டுள்ளன.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportBatchExcel}
                className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-emerald-900 font-black px-4 py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
              >
                <FileSpreadsheet size={15} className="text-emerald-700" />
                <span>Excel அறிக்கை (.xlsx)</span>
              </button>

              <button
                onClick={handleExportBatchPDF}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
              >
                <FileText size={15} />
                <span>PDF அறிக்கை (.pdf)</span>
              </button>

              <Link
                to="/admin/student-fee-statement"
                className="flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition-all border border-emerald-600"
              >
                <span>அறிக்கைகள் பார்க்க</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="bg-emerald-950/60 p-3 rounded-xl border border-emerald-800/60">
              <span className="text-emerald-300 text-[11px]">பதிவு செய்யப்பட்ட மாணவர்கள்</span>
              <p className="text-lg font-black text-white mt-0.5">{processedBatchResult.totalCount}</p>
            </div>
            <div className="bg-emerald-950/60 p-3 rounded-xl border border-emerald-800/60">
              <span className="text-emerald-300 text-[11px]">மொத்த வசூல் தொகை</span>
              <p className="text-lg font-black text-white mt-0.5">ரூ. {processedBatchResult.totalAmount.toLocaleString()}</p>
            </div>
            <div className="bg-emerald-950/60 p-3 rounded-xl border border-emerald-800/60">
              <span className="text-emerald-300 text-[11px]">கட்டண மாதம்</span>
              <p className="text-lg font-black text-white mt-0.5">{processedBatchResult.month}</p>
            </div>
            <div className="bg-emerald-950/60 p-3 rounded-xl border border-emerald-800/60">
              <span className="text-emerald-300 text-[11px]">Batch ID</span>
              <p className="text-xs font-mono font-bold text-emerald-200 mt-1 truncate">{processedBatchResult.batchId}</p>
            </div>
          </div>
        </div>
      )}

      {/* Explanatory Help Card for Users */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
          <Info size={16} className="text-blue-600" />
          <span>பல்க் கட்டணப் பதிவேற்றம் எவ்வாறு இயங்குகிறது? (How it works)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="font-black text-slate-800 mb-1 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] flex items-center justify-center">1</span>
              <span>Excel கோப்பு தயாரிப்பு</span>
            </div>
            <p className="text-[11px] text-slate-500">
              உங்கள் எக்செல் கோப்பில் Name, Phone, Roll Number, payment என்ற நிரல்கள் (columns) இருக்க வேண்டும். மாதிரி கோப்பை பதிவிறக்கம் செய்து அதைப் பயன்படுத்தலாம்.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="font-black text-slate-800 mb-1 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] flex items-center justify-center">2</span>
              <span>தானியங்கி ரோல் எண் பொருத்தம்</span>
            </div>
            <p className="text-[11px] text-slate-500">
              எக்செல்லில் உள்ள ரோல் எண்ணை (எ.கா. 2026/SEM/B1/1901) வைத்து அகாடமி தரவுத்தளத்தில் உள்ள மாணவர் தானாக அடையாளம் காணப்படுவார். பொருந்தாதவர்களை நேரடியாகத் தேர்ந்தெடுக்கலாம்.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200">
            <div className="font-black text-slate-800 mb-1 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] flex items-center justify-center">3</span>
              <span>உடனடி மாணவர் போர்டல் அப்டேட்</span>
            </div>
            <p className="text-[11px] text-slate-500">
              பதிவு செய்தவுடன் மாணவர்களின் சொந்த பக்கத்தில் (Student Portal Fees) கட்டணம் செலுத்தப்பட்டதாக உடனடியாக பதிவாகும், மேலும் Zoom பிளாக் தானாக நீங்கும்.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
