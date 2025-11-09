"use client";

import { forwardRef, useImperativeHandle, useEffect, useState, useRef } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, rtdb, auth } from "@/firebaseConfig";
import CheckoutModal from "./CheckoutModal";
import BreakModal from "./BreakModal";
import { signOutUser } from "@/utils/auth";
import SuccessModal from "@/components/common/SuccessModal";
import { ClipboardClock } from 'lucide-react';

import { ref as rtdbRef, set as rtdbSet } from "firebase/database";

// Export the interface
export interface TimeManagementHandle {
  autoCheckIn: () => void;
}

interface TimeLog {
  id: string;
  type: "checkin" | "checkout" | "breakStart" | "breakEnd";
  breakType?: string;
  note?: string;
  timestamp?: Timestamp; 
}

interface TimeManagementProps {
  userId: string;
  className?: string; // optional
}

interface LogRow {
  date: string;
  start: string;
  end: string;
  total: number | "-";
  type: string;
  note?: string;
}

// -----------------------
// Prepare daily summary
// -----------------------
interface DailySummary {
  date: string;
  checkIn: string;
  totalBreak: number; 
  totalWork: number; 
  totalHours: string; 
}


const TimeManagement = forwardRef<TimeManagementHandle, TimeManagementProps>(({ userId }, ref) => {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [currentStatus, setCurrentStatus] = useState<"offline" | "checkedIn" | "onBreak" | "checkedOut">("offline");
  const [clock, setClock] = useState(new Date());
  const [totalBreak, setTotalBreak] = useState(0);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const hasAutoCheckedIn = useRef(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);


  // -----------------------
// Prepare daily summaries inside component
// -----------------------
const dailySummaries: DailySummary[] = [];

if (logs.length > 0) {
  const todayStr = new Date().toDateString();

  // Only logs for today and with valid timestamps
  const dayLogs = logs.filter((log) => log.timestamp?.toDate?.() && log.timestamp.toDate().toDateString() === todayStr);

  let checkInTime: Date | null = null;
  let totalBreak = 0;
  let totalWork = 0;
  let workStart: Date | null = null;
  let lastBreakStart: Date | null = null;

  dayLogs.forEach((log) => {
    const time = log.timestamp?.toDate();
    if (!time) return; // skip logs without timestamp

    switch (log.type) {
      case "checkin":
        checkInTime = time;
        workStart = time;
        break;
      case "checkout":
        if (workStart) {
          totalWork += (time.getTime() - workStart.getTime()) / 1000 / 60;
          workStart = null;
        }
        break;
      case "breakStart":
        lastBreakStart = time;
        break;
      case "breakEnd":
        if (lastBreakStart) {
          const breakMinutes = (time.getTime() - lastBreakStart.getTime()) / 1000 / 60;
          totalBreak += breakMinutes;
          totalWork -= breakMinutes;
          lastBreakStart = null;
        }
        break;
    }
  });

  const hours = Math.floor(totalWork / 60);
  const minutes = Math.round(totalWork % 60);
  const totalHoursStr = `${hours}h ${minutes}m`;

  dailySummaries.push({
    date: todayStr,
    //checkIn: checkInTime ? checkInTime.toLocaleTimeString() : "-",
    checkIn: "-",
    totalBreak: Math.round(totalBreak),
    totalWork: Math.round(totalWork),
    totalHours: totalHoursStr,
  });
}




  // -----------------------
  // Real-time clock
  // -----------------------
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // -----------------------
  // Fetch logs & calculate status
  // -----------------------
  useEffect(() => {
    const logsRef = collection(db, "timeLogs", userId, "logs");
    const q = query(logsRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeLog));
      // Filter logs to today only
      const today = new Date();
      const filtered = data.filter(log => {
          const logDate = log.timestamp?.toDate();
          return logDate?.toDateString() === today.toDateString();
      });

      setLogs(filtered);

      // Set status based on last log
      if (!filtered.length) setCurrentStatus("offline");
      else {
        const last = filtered[filtered.length - 1];
        switch (last.type) {
          case "checkin":
              setCurrentStatus("checkedIn");
              break;
          case "breakStart":
              setCurrentStatus("onBreak");
              break;
          case "breakEnd":
              setCurrentStatus("checkedIn");
              break;
          case "checkout":
              setCurrentStatus("checkedOut");
              break;
          }
      }

      // Calculate total break
      let total = 0;
      let breakStartTime: Date | null = null;
      filtered.forEach((log) => {
        const logTime = log.timestamp?.toDate ? log.timestamp.toDate() : null;
        if (!logTime) return;

        if (log.type === "breakStart") breakStartTime = logTime;
        if (log.type === "breakEnd" && breakStartTime) {
        total += (logTime.getTime() - breakStartTime.getTime()) / 1000 / 60;
        breakStartTime = null;
        }
      });
      setTotalBreak(Math.round(total));
    });

    return () => unsubscribe();
  }, [userId]);

  // inside TimeManagement component
  const updateStatus = async (status: "online" | "onBreak" | "offline") => {
      const statusRef = rtdbRef(rtdb, `/status/${userId}`);
      await rtdbSet(statusRef, status);
  };

  // -----------------------
  // Add log function
  // -----------------------
  const addLog = async (type: TimeLog["type"], breakType?: string, note?: string) => {
    const data: Partial<TimeLog> = { type, timestamp: serverTimestamp() as Timestamp };
    if (breakType) data.breakType = breakType;
    if (note) data.note = note;

    await addDoc(collection(db, "timeLogs", userId, "logs"), data);

    // Update currentStatus and Realtime DB
    switch (type) {
      case "checkin":
          setCurrentStatus("checkedIn");
          updateStatus("online");
          break;
      case "checkout":
          setCurrentStatus("checkedOut");
          updateStatus("offline");
          break;
      case "breakStart":
          setCurrentStatus("onBreak");
          updateStatus("onBreak");
          break;
      case "breakEnd":
          setCurrentStatus("checkedIn");
          updateStatus("online");
          break;
    }
  };

  // -----------------------
  // Auto check-in
  // -----------------------
  useImperativeHandle(
    ref,
    () => ({
      autoCheckIn: async () => {
        if (!hasAutoCheckedIn.current && currentStatus === "offline") {
          hasAutoCheckedIn.current = true;
          await addLog("checkin");
        }
      },
    }),
    [currentStatus]
  );

  // -----------------------
  // Auto check-in if offline
  // -----------------------
  useEffect(() => {
    if (!hasAutoCheckedIn.current && logs.length > 0) {
        const todayCheckin = logs.find((log) => log.type === "checkin");
        if (!todayCheckin && currentStatus === "offline") {
            hasAutoCheckedIn.current = true;
            addLog("checkin");
        }
    }
  }, [logs, currentStatus]);


  // -----------------------
  // Analog clock calculations
  // -----------------------

  const seconds = clock.getSeconds();
  const minutes = clock.getMinutes();
  const hours = clock.getHours() % 12;
  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6;
  const hourDeg = hours * 30 + minutes * 0.5;
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // -----------------------
  // JSX
  // -----------------------
  return (
    <div className="flex flex-col space-y-4 w-full max-w-6xl mx-auto p-14 pt-8 pb-8 border-[1.5px] border-gray-200 rounded-md">
      {/* Clock Card */}
      <div
        className="flex flex-col items-center justify-center p-2 rounded-lg"
        style={{ backgroundColor: "#910A67" }} 
      >
        <div
          className="flex flex-col items-center justify-center p-6 rounded-xl shadow-xl text-white w-full relative"
          style={{ backgroundColor: "#030637" }} 
        >
          {/* Date at top */}
          <div className="absolute top-0 px-3 py-1  text-white text-xl" style={{ backgroundColor: "#910A67" }}>
            {clock.toLocaleDateString(undefined, dateOptions)}
          </div>

          <div className="relative w-30 h-30 rounded-lg bg-white/20 flex items-center justify-center shadow-inner mb-4 mt-6">
            <div className="w-25 h-25 rounded-lg bg-white flex items-center justify-center relative">
              {/* Hour */}
              <div
                className="absolute bg-black rounded"
                style={{
                  width: "4px",
                  height: "30%",
                  bottom: "50%",
                  left: "50%",
                  transform: `rotate(${hourDeg}deg)`,
                  transformOrigin: "bottom center",
                }}
              />
              {/* Minute */}
              <div
                className="absolute bg-black rounded"
                style={{
                  width: "3px",
                  height: "45%",
                  bottom: "50%",
                  left: "50%",
                  transform: `rotate(${minuteDeg}deg)`,
                  transformOrigin: "bottom center",
                }}
              />
              {/* Center dot */}
              <div className="absolute w-4 h-4 bg-black rounded-md z-10" />
            </div>
          </div>

          {/* Clock time */}
          <div className="text-4xl font-mono font-bold">{clock.toLocaleTimeString()}</div>

          {/* Timezone at bottom-left */}
          <div className="absolute bottom-3 left-3 text-sm">
            Timezone: <span className="font-bold">{timeZone}</span>
          </div>
        </div>
      </div>

      {/* Status Card */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow flex flex-col space-y-2">
        <div className="flex items-center space-x-2">
          <span
            className={`w-3 h-3 rounded-full ${
              currentStatus === "checkedIn"
                ? "bg-green-500"
                : currentStatus === "onBreak"
                ? "bg-yellow-400"
                : "bg-gray-400"
            }`}
          />
          <span>Status:{" "} <span className="capitalize font-semibold">{currentStatus === "checkedIn" ? "Online" : currentStatus === "onBreak" ? "On Break" : currentStatus}</span></span>
        </div>
        <div>Total Break Time: <span className="font-semibold">{totalBreak} min</span></div>
        {currentStatus === "checkedOut" && (
          <div className="text-sm text-gray-500 mt-1">Work session ended.</div>
        )}
      </div>

      {/* Action Buttons */}

      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow flex justify-between items-center">
        {/* Left side: Break buttons */}
        <div className="flex gap-2">
          <button
            disabled={currentStatus !== "checkedIn"}
            onClick={() => setShowBreakModal(true)}
            className="px-3 py-2 text-white rounded disabled:opacity-50 bg-[#3C0753] hover:bg-[#52086A]"
          >
            Break In
          </button>
          <button
            disabled={currentStatus !== "onBreak"}
            onClick={() => addLog("breakEnd")}
            className="px-3 py-2 text-white rounded hover:bg-[#1A0F5C] disabled:opacity-50 bg-[#030637]"
          >
            Break Out
          </button>
        </div>

        {/* Right side: Check Out */}
        <div>
          <button
            disabled={!(currentStatus === "checkedIn" || currentStatus === "onBreak")}
            onClick={() => setShowCheckoutModal(true)}
            className="px-3 py-2 text-white rounded disabled:opacity-50 bg-[#910A67] hover:bg-[#b21784]"
          >
            Check Out
          </button>
        </div>
      </div>

      {/* Daily Summary Table */}
      // -----------------------
// Prepare daily summaries before JSX
// -----------------------


// -----------------------
// JSX for rendering Daily Summary
// -----------------------
<div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex-1 overflow-x-auto">
  <h3 className="flex items-center font-bold mb-2">
    <ClipboardClock size={18} className="mr-2 opacity-80" />
    Daily Summary
  </h3>

  {dailySummaries.length === 0 ? (
    <div className="text-center py-2">No summary available.</div>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse border border-gray-300 dark:border-gray-600">
        <thead>
          <tr className="bg-gray-200 dark:bg-gray-700">
            <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Date</th>
            <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Check-In</th>
            <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Total Break (min)</th>
            <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Total Work (min)</th>
            <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Total Hours</th>
          </tr>
        </thead>
        <tbody>
          {dailySummaries.map((summary, idx) => (
            <tr key={idx} className="even:bg-gray-50 dark:even:bg-gray-700">
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{summary.date}</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{summary.checkIn}</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{summary.totalBreak}</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{summary.totalWork}</td>
              <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{summary.totalHours}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>




      {/* Logs as table */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow flex-1 overflow-y-auto max-h-[200px]">
        <h3 className="flex items-center font-bold mb-2">
          <ClipboardClock size={18} className="mr-2 opacity-80" />
          Today’s Logs
        </h3>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse border border-gray-300 dark:border-gray-600">
            <thead>
              <tr className="bg-gray-200 dark:bg-gray-700">
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Date</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Start</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">End</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Total (min)</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Type</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-2">
                    No logs for today.
                  </td>
                </tr>
              ) : (() => {
                type BreakLog = { start: Date; type?: string; note?: string } | null;
                const rows: LogRow[] = [];
                let lastCheckIn: Date | null = null;
                let lastBreak: BreakLog = null;

                logs.forEach((log) => {
                  const logTime = log.timestamp?.toDate();
                  if (!logTime) return;
                  const logDate = logTime.toLocaleDateString();

                  switch (log.type) {
                    case "checkin":
                      lastCheckIn = logTime;
                      break;

                    case "checkout":
                      if (lastCheckIn) {
                        rows.push({
                          date: logDate,
                          start: lastCheckIn.toLocaleTimeString(),
                          end: logTime.toLocaleTimeString(),
                          total: Math.round((logTime.getTime() - lastCheckIn.getTime()) / 1000 / 60),
                          type: "Work",
                          note: log.note ?? "-",
                        });
                        lastCheckIn = null;
                      }
                      break;

                    case "breakStart":
                      lastBreak = { start: logTime, type: log.breakType, note: log.note };
                      break;

                    case "breakEnd":
                      if (lastBreak) {
                        rows.push({
                          date: logDate,
                          start: lastBreak.start.toLocaleTimeString(),
                          end: logTime.toLocaleTimeString(),
                          total: Math.round((logTime.getTime() - lastBreak.start.getTime()) / 1000 / 60),
                          type: lastBreak.type ?? "Break",
                          note: lastBreak.note ?? "-",
                        });
                        lastBreak = null;
                      }
                      break;
                  }
                });

                // Handle ongoing break (no breakEnd yet)
                if (lastBreak) {
                  const br = lastBreak as { start: Date; type?: string; note?: string }; // Type assertion
                  rows.push({
                    date: br.start.toLocaleDateString(),
                    start: br.start.toLocaleTimeString(),
                    end: "-",
                    total: "-",
                    type: br.type ?? "Break",
                    note: br.note ?? "-",
                  });
                }
                return [...rows].reverse().map((row, idx) => (
                  <tr key={idx} className="even:bg-gray-50 dark:even:bg-gray-700">
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{row.date}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{row.start}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{row.end}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{row.total}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{row.type}</td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{row.note}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Break Modal */}
      {showBreakModal && (
        <BreakModal
          onSubmit={async (breakType: string, note?: string) => {
            await addLog("breakStart", breakType, note);
            setShowBreakModal(false);
          }}
          onClose={() => setShowBreakModal(false)}
        />
      )}

      {showCheckoutModal && (
        <CheckoutModal
          onCancel={() => setShowCheckoutModal(false)}
          onConfirm={async () => {
            setShowCheckoutModal(false);

            try {
              await addLog("checkout");          // log checkout
              setShowSuccessModal(true);
              setTimeout(async () => {
                await signOutUser(userId);       // then logout after 1-2s
              }, 1500);
            } catch (err) {
              alert("Something went wrong during checkout.");
            }
          }}
        />
      )}

      {showSuccessModal && (
        <SuccessModal
          message="You have successfully checked out."
          onClose={() => setShowSuccessModal(false)}
        />
      )}

    </div>
  );
});
export default TimeManagement;