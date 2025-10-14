import React from "react";

interface ToggleProps {
  mode: "creator" | "user";
  onToggle: (mode: "creator" | "user") => void;
}

const CreatorUserToggle: React.FC<ToggleProps> = ({ mode, onToggle }) => {
  return (
    <div className="relative inline-flex px-4 w-48 h-10 rounded-full overflow-hidden shadow-lg">
      {/* User Side - Left */}
      <button
        onClick={() => onToggle("user")}
        className={`flex-1 px-3 py-1 transition-all duration-300 flex items-center justify-center relative text-sm font-bold uppercase ${
          mode === "user"
            ? "bg-purple-800 text-purple-200"
            : "bg-gray-600 text-gray-300 hover:bg-gray-500"
        }`}
      >
        User
        {/* Angled Divider */}
        <div className="absolute right-0 top-0 h-full w-[1px] bg-gray-400 transform rotate-12 translate-x-0.5" />
      </button>

      {/* Creator Side - Right */}
      <button
        onClick={() => onToggle("creator")}
        className={`flex-1 px-3 py-1 transition-all duration-300 flex items-center justify-center text-sm font-bold uppercase ${
          mode === "creator"
            ? "bg-white text-purple-800"
            : "bg-gray-600 text-gray-300 hover:bg-gray-500"
        }`}
      >
        Creator
      </button>
    </div>
  );
};

export default CreatorUserToggle;

