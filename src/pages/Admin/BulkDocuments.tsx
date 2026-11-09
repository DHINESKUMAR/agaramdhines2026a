import React, { useState, useEffect, useRef, useMemo } from "react";
import { getStudents, getClasses, getAdminSettings, getSubjects } from "../../lib/db";
import { Printer, CheckSquare, Square, Search, Award, FileText, CreditCard, User, Download, X, Layers, Sparkles, BookOpen } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { checkObjectMatchesPhone } from "../../lib/phoneUtils";
import StudentIdCardA4 from "../../components/StudentIdCardA4";

export default function BulkDocuments() {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [adminSettings, setAdminSettings] = useState<any>(null);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showBulkIdModal, setShowBulkIdModal] = useState(false);
  
  const printRef = useRef<HTMLDivElement>(null);
  const [printMode, setPrintMode] = useState<'idcard' | 'certificate' | null>(null);

  useEffect(() => {
    getStudents().then(data => setStudents(data || []));
    getClasses().then(data => setClasses(data || []));
    getAdminSettings().then(data => setAdminSettings(data));
    getSubjects().then(data => setAllSubjects(data || []));
  }, []);

  // Compute available unique subjects from students, classes, and DB
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      const subs = s.subjects || s.enrolledClasses || [];
      if (Array.isArray(subs)) {
        subs.forEach((sub: any) => {
          const clean = typeof sub === 'string' ? sub.trim() : (sub?.name || '');
          if (clean) set.add(clean);
        });
      }
    });
    classes.forEach(c => {
      if (Array.isArray(c.subjects)) {
        c.subjects.forEach((sub: any) => {
          const clean = typeof sub === 'string' ? sub.trim() : (sub?.name || '');
          if (clean) set.add(clean);
        });
      }
    });
    allSubjects.forEach(s => {
      const clean = typeof s === 'string' ? s.trim() : (s?.name || '');
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students, classes, allSubjects]);

  const filteredStudents = students.filter(s => {
    const matchesGrade = selectedGrade ? s.grade === selectedGrade : true;

    const studentSubs = (s.subjects || s.enrolledClasses || []).map((sub: any) => 
      (typeof sub === 'string' ? sub : sub?.name || '')?.toString().trim().toLowerCase()
    );
    const matchesSubject = !selectedSubject || selectedSubject === "ALL"
      ? true
      : studentSubs.some((sub: string) => sub === selectedSubject.toLowerCase().trim());

    const matchesSearch = searchQuery 
      ? s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.rollNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        checkObjectMatchesPhone(s, searchQuery)
      : true;

    return matchesGrade && matchesSubject && matchesSearch;
  });

  const handleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Chunk array into groups of 8 for A4 portrait sheets (2 columns x 4 rows)
  const chunkIntoEights = (arr: any[]) => {
    const chunks: any[][] = [];
    for (let i = 0; i < arr.length; i += 8) {
      chunks.push(arr.slice(i, i + 8));
    }
    return chunks;
  };

  const selectedStudentsData = students.filter(s => selectedIds.has(s.id));
  const idCardPrintItems = selectedStudentsData.length > 0 ? selectedStudentsData : filteredStudents;
  const a4Pages = chunkIntoEights(idCardPrintItems);

  // Download Bulk 8-per-A4 ID Card Sheets as PDF
  const handleDownloadA4PDF = async () => {
    const container = document.getElementById("printable-bulk-idcards");
    if (!container) return;

    try {
      setIsGeneratingPdf(true);
      const sheets = container.querySelectorAll(".a4-idcard-sheet");
      if (sheets.length === 0) return;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i] as HTMLElement;
        if (i > 0) pdf.addPage("a4", "portrait");

        const dataUrl = await toPng(sheet, {
          quality: 0.98,
          pixelRatio: 2.5,
          backgroundColor: "#ffffff"
        });

        pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      }

      pdf.save(`Agaram_Student_ID_Cards_A4_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err: any) {
      console.error("Error generating bulk A4 ID cards PDF:", err);
      alert("A4 PDF பதிவிறக்கத்தில் பிழை: " + (err?.message || err));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintA4Sheets = () => {
    window.print();
  };

  const handlePrint = (mode: 'idcard' | 'certificate') => {
    if (mode === 'idcard') {
      setShowBulkIdModal(true);
      return;
    }

    if (selectedIds.size === 0) {
      alert("Please select at least one student.");
      return;
    }
    setPrintMode(mode);
    setIsGenerating(true);
    
    // Give React time to render the hidden print area
    setTimeout(() => {
      const content = printRef.current;
      if (!content) {
        setIsGenerating(false);
        setPrintMode(null);
        return;
      }

      let printIframe = document.getElementById('bulk-print-iframe') as HTMLIFrameElement;
      if (!printIframe) {
        printIframe = document.createElement('iframe');
        printIframe.id = 'bulk-print-iframe';
        printIframe.style.position = 'absolute';
        printIframe.style.top = '-9999px';
        printIframe.style.left = '-9999px';
        printIframe.title = 'Print Frame';
        document.body.appendChild(printIframe);
      }

      const printDoc = printIframe.contentWindow?.document;
      
      if (printDoc) {
        printDoc.open();
        printDoc.write(`
          <html>
            <head>
              <title>Bulk Print Certificates</title>
              <script src="https://cdn.tailwindcss.com"></script>
              <style>
                @media print {
                  .page-break { page-break-after: always; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                .cert-container { display: flex; flex-direction: column; align-items: center; gap: 40px; }
              </style>
            </head>
            <body class="p-8 bg-white">
              ${content.innerHTML}
            </body>
          </html>
        `);
        printDoc.close();
        
        setTimeout(() => {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
          setIsGenerating(false);
          setPrintMode(null);
        }, 1500);
      } else {
        setIsGenerating(false);
        setPrintMode(null);
        alert("Unable to generate print document. Please check your browser's security settings.");
      }
    }, 500);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Print Styles for 8-per-A4 Portrait Sheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-bulk-idcards, #printable-bulk-idcards * {
            visibility: visible;
          }
          #printable-bulk-idcards {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm !important;
            display: block !important;
            background: #fff;
          }
          .a4-idcard-sheet {
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            box-sizing: border-box !important;
            padding: 9mm 8mm !important;
            display: grid !important;
            grid-template-columns: 94mm 94mm !important;
            grid-template-rows: 66mm 66mm 66mm 66mm !important;
            gap: 5mm 6mm !important;
            position: relative !important;
            background: #fff !important;
            overflow: hidden !important;
          }
          @page {
            size: 210mm 297mm portrait;
            margin: 0;
          }
        }
      `}</style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              பல்க் ஆவண ஜெனரேட்டர் (Bulk Documents)
            </h1>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
              8-Per-A4 Portrait
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            மாணவர்களின் அடையாள அட்டைகளை A4 போர்ட்ரைட்டில் 8 வீதம் பல்க்காக அச்சிட & சான்றிதழ்களை உருவாக்கலாம்.
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowBulkIdModal(true)}
            disabled={idCardPrintItems.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm shadow-indigo-600/20 cursor-pointer"
            title="A4 போர்ட்ரைட்டில் 8 அடையாள அட்டைகள் வீதம் அச்சிட அல்லது PDF சேமிக்க"
          >
            <CreditCard size={18} />
            <span>A4-ல் 8 ID கார்டுகள் பல்க் {selectedIds.size > 0 ? `(${selectedIds.size})` : `(${filteredStudents.length})`}</span>
          </button>

          <button
            onClick={() => handlePrint('certificate')}
            disabled={selectedIds.size === 0 || isGenerating}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm shadow-emerald-600/20 cursor-pointer"
          >
            {isGenerating && printMode === 'certificate' ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <FileText size={18} />
            )}
            <span>சான்றிதழ்கள் ({selectedIds.size})</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="sm:w-56">
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-xs sm:text-sm font-semibold text-slate-800"
            >
              <option value="">அனைத்து வகுப்புகள் (All Classes)</option>
              {classes.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="sm:w-64">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-xs sm:text-sm font-bold text-slate-800"
            >
              <option value="ALL">அனைத்துப் பாடங்கள் (All Subjects)</option>
              {availableSubjects.map(sub => {
                const count = students.filter(st => {
                  const sSubs = (st.subjects || st.enrolledClasses || []).map((sb: any) => (typeof sb === 'string' ? sb : sb?.name || '')?.toString().trim().toLowerCase());
                  return sSubs.includes(sub.toLowerCase()) && (!selectedGrade || st.grade === selectedGrade);
                }).length;
                return (
                  <option key={sub} value={sub}>
                    {sub} ({count} மாணவர்கள்)
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white">
              <tr>
                <th scope="col" className="px-6 py-3 text-left">
                  <button 
                    onClick={handleSelectAll}
                    className="flex items-center text-gray-500 hover:text-indigo-600"
                  >
                    {selectedIds.size === filteredStudents.length && filteredStudents.length > 0 ? (
                      <CheckSquare size={20} className="text-indigo-600" />
                    ) : (
                      <Square size={20} />
                    )}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID Number
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Class
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Roll No
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr 
                    key={student.id} 
                    className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(student.id) ? 'bg-indigo-50/30' : ''}`}
                    onClick={() => toggleSelect(student.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {selectedIds.has(student.id) ? (
                        <CheckSquare size={20} className="text-indigo-600" />
                      ) : (
                        <Square size={20} className="text-gray-400" />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                          {student.image ? (
                            <img className="h-10 w-10 object-cover" src={student.image} alt="" />
                          ) : (
                            <span className="text-gray-500 font-medium text-lg">{student.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{student.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-mono">{student.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {student.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {student.rollNo || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.phone || 'N/A'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No students found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden Print Area */}
      <div className="hidden">
        <div ref={printRef}>
          {printMode === 'idcard' && (
            <div className="id-grid">
              {selectedStudentsData.map(student => (
                <div key={student.id} className="w-[3.375in] h-[2.125in] bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-xl p-2.5 relative overflow-hidden text-white shadow-lg print:shadow-none break-inside-avoid shrink-0 flex flex-col justify-between" style={{ pageBreakInside: 'avoid' }}>
                  {/* Subtle background glow accents */}
                  <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-sky-400/20 rounded-full blur-xl pointer-events-none"></div>

                  {/* Top Header Row */}
                  <div className="flex items-center justify-between gap-1.5 border-b border-white/20 pb-1 z-10">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-9 h-9 bg-white rounded-full p-0.5 shadow-md border border-amber-300 shrink-0 flex items-center justify-center overflow-hidden">
                        <img 
                          src={adminSettings?.profileImage || "/logo.png"} 
                          alt="AGARAM DHINES ONLINE ACADEMY" 
                          crossOrigin="anonymous"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/logo.png";
                          }}
                          className="w-full h-full object-cover rounded-full" 
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[9px] font-black uppercase tracking-wider text-white leading-tight drop-shadow-xs truncate">
                          {adminSettings?.instituteName || "AGARAM DHINES ONLINE ACADEMY"}
                        </h3>
                        <p className="text-[7.5px] font-extrabold text-amber-200 leading-tight drop-shadow-xs truncate">
                          அகரம் தினேஷ் ஆன்லைன் அகாடமி
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[6.5px] font-black bg-amber-400 text-indigo-950 px-1.5 py-0.5 rounded shadow-xs uppercase tracking-wider">
                        OFFICIAL ID
                      </span>
                      <span className="text-[7px] font-extrabold text-sky-100 block mt-0.5 whitespace-nowrap">
                        📞 778054232
                      </span>
                    </div>
                  </div>

                  {/* Student Main Info Row */}
                  <div className="flex items-center gap-2 my-0.5 z-10">
                    <div className="w-10 h-10 rounded-full border-2 border-white/90 overflow-hidden shrink-0 bg-white/20 flex items-center justify-center shadow-md">
                      {student.image ? (
                        <img src={student.image} alt={student.name} className="w-full h-full object-cover" />
                      ) : (
                        <User size={20} className="text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[11px] font-extrabold text-white truncate leading-tight drop-shadow-xs">
                        {student.name}
                      </h2>
                      <div className="flex items-center gap-2 text-[8px] text-sky-100 mt-0.5">
                        <span>Grade: <strong className="text-amber-200">{student.grade}</strong></span>
                        <span className="text-white/40">•</span>
                        <span>Roll No: <strong className="text-white">{student.rollNo || 'N/A'}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Enrolled Subjects List - Colorful Badges */}
                  <div className="z-10 bg-black/20 backdrop-blur-xs p-1 rounded-md border border-white/15">
                    <span className="text-[6.5px] font-black uppercase tracking-wider text-sky-200 block mb-0.5">
                      Subjects / பாடங்கள்:
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-[26px] overflow-hidden">
                      {(() => {
                        const subs = student.subjects || student.enrolledClasses;
                        const badgeColors = [
                          'bg-amber-400 text-indigo-950',
                          'bg-emerald-400 text-indigo-950',
                          'bg-sky-300 text-indigo-950',
                          'bg-pink-300 text-indigo-950',
                          'bg-purple-300 text-indigo-950',
                          'bg-yellow-300 text-indigo-950',
                        ];
                        if (Array.isArray(subs) && subs.length > 0) {
                          return subs.map((s: string, idx: number) => (
                            <span 
                              key={idx} 
                              className={`text-[7px] font-black px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap ${badgeColors[idx % badgeColors.length]}`}
                            >
                              {s}
                            </span>
                          ));
                        }
                        return (
                          <span className="text-[7px] font-bold px-1.5 py-0.2 rounded bg-amber-400 text-indigo-950">
                            All Registered Courses
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Footer Credentials & QR Code */}
                  <div className="flex items-end justify-between gap-1 mt-0.5 z-10">
                    <div className="bg-black/25 backdrop-blur-xs px-1.5 py-0.5 rounded border border-white/20 text-[7.5px] font-mono leading-tight flex-1">
                      <p className="text-white/80 flex justify-between"><span>Username:</span> <span className="text-white font-bold">{student.username}</span></p>
                      <p className="text-white/80 flex justify-between"><span>Password:</span> <span className="text-amber-200 font-bold">{student.password}</span></p>
                    </div>
                    <div className="bg-white p-0.5 rounded shrink-0 shadow-md">
                      <QRCodeSVG value={student.id} size={32} level="H" includeMargin={false} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {printMode === 'certificate' && (
            <div className="cert-container">
              {selectedStudentsData.map(student => (
                <div key={student.id} className="w-[11in] h-[8.5in] bg-gradient-to-br from-amber-50/60 via-white to-indigo-50/40 p-10 relative break-inside-avoid shrink-0 flex flex-col justify-between overflow-hidden shadow-xl print:shadow-none" style={{ pageBreakInside: 'avoid' }}>
                  {/* Ornate Gold & Royal Blue Borders */}
                  <div className="absolute inset-4 border-[10px] border-double border-indigo-900 rounded-3xl pointer-events-none"></div>
                  <div className="absolute inset-7 border-2 border-amber-400/80 rounded-2xl pointer-events-none"></div>
                  
                  {/* Ornate Corner Accents */}
                  <div className="absolute top-6 left-6 w-16 h-16 border-t-4 border-l-4 border-amber-500 pointer-events-none"></div>
                  <div className="absolute top-6 right-6 w-16 h-16 border-t-4 border-r-4 border-amber-500 pointer-events-none"></div>
                  <div className="absolute bottom-6 left-6 w-16 h-16 border-b-4 border-l-4 border-amber-500 pointer-events-none"></div>
                  <div className="absolute bottom-6 right-6 w-16 h-16 border-b-4 border-r-4 border-amber-500 pointer-events-none"></div>

                  {/* Background Watermark Logo */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
                    <Award size={520} className="text-indigo-900" />
                  </div>

                  <div className="relative z-10 h-full w-full flex flex-col items-center justify-between text-center px-12 py-4">
                    {/* Top Academy Logo & Branding Header */}
                    <div className="flex flex-col items-center">
                      <div className="w-20 h-20 bg-white rounded-full p-1 shadow-lg border-2 border-amber-400 mb-2 overflow-hidden flex items-center justify-center">
                        <img 
                          src={adminSettings?.profileImage || "/logo.png"} 
                          alt="AGARAM DHINES ONLINE ACADEMY" 
                          crossOrigin="anonymous"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/logo.png";
                          }}
                          className="w-full h-full object-cover rounded-full" 
                        />
                      </div>
                      <h3 className="text-2xl font-black uppercase tracking-wider text-indigo-950 leading-tight">
                        {adminSettings?.instituteName || "AGARAM DHINES ONLINE ACADEMY"}
                      </h3>
                      <p className="text-base font-extrabold text-amber-600 mt-0.5 tracking-wide">
                        அகரம் தினேஷ் ஆன்லைன் அகாடமி <span className="text-indigo-800 text-sm ml-2 font-bold">| 📞 778054232</span>
                      </p>
                    </div>

                    {/* Certificate Main Title */}
                    <div className="my-2">
                      <h1 className="text-5xl font-serif font-black text-indigo-900 tracking-wide uppercase drop-shadow-xs">
                        Certificate of Excellence
                      </h1>
                      <p className="text-sm font-black text-amber-600 uppercase tracking-[0.3em] mt-1">
                        Official Academic Award
                      </p>
                    </div>

                    {/* Presentation Line & Name */}
                    <div className="w-full max-w-3xl">
                      <p className="text-base text-gray-600 font-medium tracking-widest uppercase mb-1">
                        This is proudly presented to
                      </p>
                      <h2 className="text-4xl font-extrabold text-indigo-950 border-b-4 border-amber-400 pb-2 px-10 inline-block font-serif drop-shadow-xs">
                        {student.name}
                      </h2>
                    </div>

                    {/* Citation */}
                    <p className="text-lg text-gray-700 max-w-3xl leading-relaxed font-serif my-2">
                      For outstanding academic performance, dedication, and active participation in <span className="font-bold text-indigo-900">Grade {student.grade}</span> at AGARAM DHINES ONLINE ACADEMY.
                    </p>

                    {/* Footer with Signatures, Seal & Student Credentials + QR */}
                    <div className="flex justify-between items-end w-full mt-auto pt-4">
                      {/* Date */}
                      <div className="text-center w-48">
                        <p className="font-bold text-gray-900 text-sm mb-1">{new Date().toLocaleDateString()}</p>
                        <div className="w-full border-b-2 border-indigo-900 mb-1"></div>
                        <p className="font-bold text-indigo-900 text-xs uppercase tracking-widest">Date / தேதி</p>
                      </div>

                      {/* Center Stamp & Credentials Badge */}
                      <div className="flex items-center gap-4 bg-white/90 p-3 rounded-2xl border-2 border-amber-300 shadow-md backdrop-blur-sm">
                        <div className="bg-white p-1 rounded-lg border border-indigo-100 shadow-xs">
                          <QRCodeSVG value={student.id} size={70} level="H" includeMargin={false} />
                        </div>
                        <div className="text-left text-xs font-medium text-slate-800 space-y-0.5">
                          <p><span className="font-bold text-indigo-900 w-16 inline-block">Roll No:</span> <strong className="text-slate-900">{student.rollNo || 'N/A'}</strong></p>
                          <p><span className="font-bold text-indigo-900 w-16 inline-block">Username:</span> <span className="font-mono font-bold text-indigo-700">{student.username}</span></p>
                          <p><span className="font-bold text-indigo-900 w-16 inline-block">Password:</span> <span className="font-mono font-bold text-amber-600">{student.password}</span></p>
                        </div>
                      </div>

                      {/* Director Signature */}
                      <div className="text-center w-48">
                        <div className="font-serif italic text-xl text-indigo-900 font-bold mb-1">Dhines Nivas</div>
                        <div className="w-full border-b-2 border-indigo-900 mb-1"></div>
                        <p className="font-bold text-indigo-900 text-xs uppercase tracking-widest">Director / இயக்குனர்</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 
        ====================================================
        BULK 8-PER-A4 PORTRAIT ID CARDS MODAL
        ====================================================
      */}
      {showBulkIdModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center p-2 sm:p-4 overflow-y-auto">
          {/* Sticky Toolbar */}
          <div className="sticky top-2 z-50 bg-slate-900 text-white border border-slate-700 px-5 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-4 w-full max-w-4xl mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-black flex items-center gap-2">
                <CreditCard size={18} className="text-amber-400" />
                A4 போர்ட்ரைட்டில் 8 ID கார்டுகள் பல்க் அச்சிடுதல் (8-Per-A4 Portrait ID Cards)
              </h3>
              <p className="text-[11px] text-slate-300">
                மொத்தம் {idCardPrintItems.length} மாணவர்கள் ({a4Pages.length} A4 தாள்கள்). ஒரு A4 தாளில் 8 ID கார்டுகள் வீதம் (2 x 4 வரிசை) அச்சிடப்படும்.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1.5 rounded-xl">
                <BookOpen size={14} className="text-amber-400" />
                <span className="text-[11px] font-bold text-amber-200">பாடம்:</span>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-slate-900 text-white">அனைத்துப் பாடங்கள்</option>
                  {availableSubjects.map(sub => (
                    <option key={sub} value={sub} className="bg-slate-900 text-white">{sub}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleDownloadA4PDF}
                disabled={isGeneratingPdf || idCardPrintItems.length === 0}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-black px-4 py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
                title="A4 பக்கங்களை உயர்தர PDF கோப்பாகப் பதிவிறக்க"
              >
                <Download size={16} />
                {isGeneratingPdf ? "PDF உருவாகிறது..." : "A4 PDF பதிவிறக்கு (Download PDF)"}
              </button>

              <button
                type="button"
                onClick={handlePrintA4Sheets}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                <Printer size={16} />
                அச்சிடுக / Print
              </button>

              <button
                type="button"
                onClick={() => setShowBulkIdModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-xl cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Printable Container for 8-per-A4 Grid with Horizontal Scroll Protection */}
          <div className="w-full overflow-x-auto flex flex-col items-center pb-12">
            <div id="printable-bulk-idcards" className="space-y-8">
              {a4Pages.map((pageGroup, pageIndex) => (
                <div 
                  key={pageIndex}
                  className="a4-idcard-sheet bg-white border border-slate-300 rounded-none shadow-xl mx-auto relative overflow-hidden"
                  style={{
                    width: "210mm",
                    minWidth: "210mm",
                    maxWidth: "210mm",
                    height: "297mm",
                    minHeight: "297mm",
                    maxHeight: "297mm",
                    padding: "9mm 8mm",
                    display: "grid",
                    gridTemplateColumns: "94mm 94mm",
                    gridTemplateRows: "66mm 66mm 66mm 66mm",
                    gap: "5mm 6mm",
                    overflow: "hidden",
                    boxSizing: "border-box",
                    backgroundColor: "#ffffff"
                  }}
                >
                  {/* 8 Student ID Cards on the A4 Portrait Page */}
                  {pageGroup.map((studentItem) => (
                    <div 
                      key={studentItem.id} 
                      className="w-[94mm] h-[66mm] max-w-[94mm] max-h-[66mm] min-h-0 min-w-0 flex items-center justify-center overflow-hidden"
                      style={{ width: "94mm", height: "66mm", maxHeight: "66mm", boxSizing: "border-box" }}
                    >
                      <StudentIdCardA4 
                        student={studentItem} 
                        adminSettings={adminSettings}
                        selectedSubject={selectedSubject}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
