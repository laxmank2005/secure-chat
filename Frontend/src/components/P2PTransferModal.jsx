import React, { useEffect, useState } from 'react';
import { BsCheck, BsX, BsLightningFill } from 'react-icons/bs';

const P2PTransferModal = ({ incomingTransfer, activeTransfer, acceptTransfer, rejectTransfer, resetTransfer }) => {
  const [speed, setSpeed] = useState(0);
  const [lastProgress, setLastProgress] = useState(0);

  // Speed calculation
  useEffect(() => {
    if (!activeTransfer || activeTransfer.status !== 'receiving') return;

    const interval = setInterval(() => {
      setSpeed(activeTransfer.progress - lastProgress);
      setLastProgress(activeTransfer.progress);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTransfer, lastProgress]);

  if (!incomingTransfer && !activeTransfer) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-stone-800">
        
        {/* Incoming Transfer Request */}
        {incomingTransfer && !activeTransfer && (
          <div className="p-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
              <BsLightningFill className="text-3xl" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Incoming File</h3>
            <p className="text-sm text-gray-500 dark:text-stone-400 mb-6 font-inter w-full">
              Someone wants to send you <br/><strong className="text-gray-800 dark:text-stone-300 break-all inline-block mt-1">"{incomingTransfer.fileInfo.name}"</strong> 
              <br />
              Size: {(incomingTransfer.fileInfo.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => rejectTransfer(incomingTransfer.senderId)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-gray-700 dark:text-stone-300 bg-gray-100 dark:bg-stone-800 hover:bg-gray-200 dark:hover:bg-stone-700 transition"
              >
                Reject
              </button>
              <button 
                onClick={() => acceptTransfer(incomingTransfer.senderId)}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition flex justify-center items-center gap-2"
              >
                <BsCheck className="text-xl" /> Accept
              </button>
            </div>
          </div>
        )}

        {/* Active Transfer Progress */}
        {activeTransfer && (
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <BsLightningFill className="text-blue-500" />
                  {activeTransfer.status === 'sending' ? 'Sending File...' : 
                   activeTransfer.status === 'receiving' ? 'Receiving File...' : 
                   'Waiting for Peer...'}
                </h3>
                <p className="text-xs text-gray-500 truncate max-w-[200px] mt-1">{activeTransfer.fileName}</p>
              </div>
              <button onClick={() => resetTransfer(true)} className="p-2 bg-gray-100 dark:bg-stone-800 rounded-full text-gray-500 hover:text-red-500 transition">
                <BsX className="text-xl" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 bg-gray-100 dark:bg-stone-800 rounded-full overflow-hidden mb-2 relative">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
                style={{ width: `${activeTransfer.progress || 0}%` }}
              />
            </div>
            
            <div className="flex justify-between text-xs font-semibold text-gray-500 dark:text-stone-400">
              <span>{activeTransfer.progress || 0}%</span>
              <span>{activeTransfer.status === 'receiving' && speed > 0 ? `${(speed * 100).toFixed(0)} KB/s` : 'P2P Direct Link'}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default P2PTransferModal;
