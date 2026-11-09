import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { User } from "lucide-react";

interface StudentIdCardA4Props {
  student: any;
  adminSettings?: any;
  selectedSubject?: string;
}

export default function StudentIdCardA4({ student, adminSettings, selectedSubject }: StudentIdCardA4Props) {
  const rawSubs = student.subjects || student.enrolledClasses;
  const subjects = Array.isArray(rawSubs) && rawSubs.length > 0
    ? rawSubs
    : ["All Registered Courses"];

  const hasSpecificSubject = selectedSubject && selectedSubject !== "ALL" && selectedSubject.trim() !== "";

  const badgeColors = [
    'bg-amber-400 text-indigo-950',
    'bg-emerald-400 text-indigo-950',
    'bg-sky-300 text-indigo-950',
    'bg-pink-300 text-indigo-950',
    'bg-purple-300 text-indigo-950',
    'bg-yellow-300 text-indigo-950',
  ];

  return (
    <div 
      className="bg-gradient-to-br from-[#1e40af] via-[#3730a3] to-[#581c87] text-white rounded-xl p-2 relative overflow-hidden shadow-sm flex flex-col justify-between border border-white/20 box-border select-none"
      style={{
        width: "94mm",
        maxWidth: "94mm",
        height: "66mm",
        maxHeight: "66mm",
        boxSizing: "border-box",
        pageBreakInside: "avoid"
      }}
    >
      {/* Background glow orbs */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-20 h-20 bg-sky-400/20 rounded-full blur-xl pointer-events-none"></div>

      {/* 1. Header: Logo + Title + Official ID + Tel */}
      <div className="flex items-center justify-between gap-1.5 border-b border-white/20 pb-1 z-10 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-7 h-7 bg-white rounded-full p-0.5 shadow-xs border border-amber-300 shrink-0 flex items-center justify-center overflow-hidden">
            <img 
              src={adminSettings?.profileImage || "/logo.png"} 
              alt="Logo" 
              crossOrigin="anonymous"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/apple-touch-icon.png";
              }}
              className="w-full h-full object-contain" 
            />
          </div>
          <div className="min-w-0">
            <h3 className="text-[8.5px] font-black uppercase tracking-wider text-white leading-tight truncate font-serif">
              {adminSettings?.instituteName || "AGARAM DHINESH ONLINE ACADEMY"}
            </h3>
            <p className="text-[7px] font-extrabold text-amber-200 leading-none truncate mt-0.5">
              அகரம் தினேஷ் ஆன்லைன் அகாடமி
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[6.5px] font-black bg-amber-400 text-indigo-950 px-1.5 py-0.2 rounded shadow-xs uppercase tracking-wider inline-block">
            OFFICIAL ID
          </span>
          <span className="text-[6.5px] font-bold text-sky-100 block mt-0.5 leading-none">
            📞 0778054232
          </span>
        </div>
      </div>

      {/* 2. Student Info: Photo + Name + Grade + Subject + Roll */}
      <div className="flex items-center gap-2 my-0.5 z-10 shrink-0">
        <div className="w-8 h-8 rounded-full border border-white/90 overflow-hidden shrink-0 bg-white/20 flex items-center justify-center shadow-xs">
          {student.image ? (
            <img src={student.image} alt={student.name} className="w-full h-full object-cover" />
          ) : (
            <User size={16} className="text-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[10.5px] font-black uppercase text-white truncate leading-tight drop-shadow-xs">
            {student.name}
          </h2>
          <div className="flex items-center gap-1.5 text-[7px] text-sky-100 mt-0.5 leading-none flex-wrap">
            <span>Grade: <strong className="text-amber-200">{student.grade || '—'}</strong></span>
            <span className="text-white/40">•</span>
            <span>Roll: <strong className="text-white font-mono">{student.rollNo || student.username || '—'}</strong></span>
            {hasSpecificSubject && (
              <>
                <span className="text-white/40">•</span>
                <span className="bg-amber-400 text-indigo-950 font-black px-1.5 py-0.2 rounded text-[6.5px] uppercase shadow-2xs">
                  {selectedSubject}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Subjects / Enrolled Courses Badges */}
      <div className="z-10 bg-black/25 backdrop-blur-xs px-1.5 py-1 rounded-lg border border-white/20 shrink-0">
        <div className="flex items-center justify-between text-[6.5px] font-black uppercase tracking-wider text-sky-200 mb-1 leading-none">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
            பாடங்கள் / Subjects:
          </span>
          {student.id && <span className="text-white/70 font-mono text-[6px]">ID: {student.id}</span>}
        </div>
        <div className="flex flex-wrap gap-1 max-h-[20px] overflow-hidden">
          {subjects.map((sub: string, idx: number) => {
            const isMatch = hasSpecificSubject && sub.toLowerCase().trim() === selectedSubject.toLowerCase().trim();
            return (
              <span 
                key={idx}
                className={`text-[7px] font-black px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap leading-tight transition-all ${
                  isMatch 
                    ? "bg-amber-400 text-indigo-950 ring-1 ring-white font-extrabold" 
                    : badgeColors[idx % badgeColors.length]
                }`}
              >
                {isMatch ? `★ ${sub}` : sub}
              </span>
            );
          })}
        </div>
      </div>

      {/* 4. Credentials Box + QR Code */}
      <div className="flex items-end justify-between gap-1.5 mt-0.5 z-10 shrink-0">
        <div className="bg-black/30 backdrop-blur-xs px-1.5 py-0.5 rounded border border-white/20 text-[7px] font-mono leading-tight flex-1">
          <div className="flex justify-between items-center text-white/90">
            <span className="text-sky-200">Username:</span>
            <span className="text-white font-bold">{student.username || student.rollNo || '—'}</span>
          </div>
          <div className="flex justify-between items-center text-white/90 mt-0.5">
            <span className="text-amber-200">Password:</span>
            <span className="text-amber-200 font-bold">{student.password || '—'}</span>
          </div>
        </div>

        <div className="bg-white p-0.5 rounded shrink-0 shadow-sm flex items-center justify-center">
          <QRCodeSVG 
            value={student.id || student.username || student.rollNo || "STUDENT"} 
            size={34} 
            level="M" 
            includeMargin={false} 
          />
        </div>
      </div>
    </div>
  );
}
