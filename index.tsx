import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';

// --- Firebase Configuration ---
// This configuration is provided by the environment.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'planning-poker-app';

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [sessionId, setSessionId] = useState(null);

    // --- Authentication ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });

        const performSignIn = async () => {
            if (!auth.currentUser) {
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Authentication failed:", error);
                }
            }
        };

        performSignIn();
        return () => unsubscribe();
    }, []);

    // --- Session Management from URL ---
    useEffect(() => {
        const getSessionIdFromUrl = () => {
            const path = window.location.pathname;
            if (path.startsWith('/session/')) {
                return path.split('/session/')[1];
            }
            return null;
        };
        const id = getSessionIdFromUrl();
        if (id) {
            setSessionId(id);
        }
    }, []);

    const handleCreateSession = async (title) => {
        if (!user) return;
        const newSessionId = Math.random().toString(36).substring(2, 10);
        const sessionRef = doc(db, `artifacts/${appId}/public/data/sessions`, newSessionId);
        await setDoc(sessionRef, {
            title: title || "New Planning Session",
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            votesRevealed: false,
            participants: {},
            currentTicket: '', // Add currentTicket field
        });
        setSessionId(newSessionId);
    };

    const handleJoinSession = (id) => {
        setSessionId(id);
    };

    if (!user) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><div className="text-xl">Authenticating...</div></div>;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            {sessionId ? (
                <PlanningSession sessionId={sessionId} userId={user.uid} />
            ) : (
                <Lobby onCreateSession={handleCreateSession} onJoinSession={handleJoinSession} />
            )}
        </div>
    );
}

// --- Lobby Component ---
function Lobby({ onCreateSession, onJoinSession }) {
    const [newSessionTitle, setNewSessionTitle] = useState('');
    const [joinSessionId, setJoinSessionId] = useState('');

    return (
        <div className="flex flex-col items-center justify-center h-screen p-4">
            <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-lg p-8">
                <h1 className="text-4xl font-bold mb-8 text-center text-teal-400">Planning Poker</h1>
                <div className="mb-6">
                    <h2 className="text-2xl font-semibold mb-4 text-center">Create a New Session</h2>
                    <input
                        type="text"
                        value={newSessionTitle}
                        onChange={(e) => setNewSessionTitle(e.target.value)}
                        placeholder="Enter session title (optional)"
                        className="w-full p-3 bg-gray-700 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                        onClick={() => onCreateSession(newSessionTitle)}
                        className="w-full mt-4 bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-md transition duration-300"
                    >
                        Create Session
                    </button>
                </div>
                <div className="border-t border-gray-700 my-6"></div>
                <div>
                    <h2 className="text-2xl font-semibold mb-4 text-center">Join an Existing Session</h2>
                    <input
                        type="text"
                        value={joinSessionId}
                        onChange={(e) => setJoinSessionId(e.target.value)}
                        placeholder="Enter session ID"
                        className="w-full p-3 bg-gray-700 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                        onClick={() => onJoinSession(joinSessionId)}
                        disabled={!joinSessionId.trim()}
                        className="w-full mt-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-md transition duration-300 disabled:bg-gray-500"
                    >
                        Join Session
                    </button>
                </div>
            </div>
        </div>
    );
}


// --- Planning Session Component ---
function PlanningSession({ sessionId, userId }) {
    const [session, setSession] = useState(null);
    const [alias, setAlias] = useState('');
    const [currentVote, setCurrentVote] = useState(null);
    const [aliasSet, setAliasSet] = useState(false);
    const [sessionExists, setSessionExists] = useState(true);
    const [copied, setCopied] = useState(false);
    const [jiraTicket, setJiraTicket] = useState(''); // State for Jira ticket input

    const votingCards = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];

    const sessionLink = `${window.location.origin}/session/${sessionId}`;

    const isFacilitator = useMemo(() => session?.createdBy === userId, [session, userId]);

    // --- Session Data Subscription ---
    useEffect(() => {
        const sessionRef = doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
        const unsubscribe = onSnapshot(sessionRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSession(data);
                setSessionExists(true);
                // Sync local jira ticket input with firestore state, primarily for facilitator
                if(isFacilitator){
                    setJiraTicket(data.currentTicket || '');
                }
            } else {
                console.error("Session not found.");
                setSession(null);
                setSessionExists(false);
            }
        });
        return () => unsubscribe();
    }, [sessionId, isFacilitator]);

    // --- User Alias Management ---
    useEffect(() => {
        if (session && session.participants && session.participants[userId]) {
            setAlias(session.participants[userId].alias);
            setAliasSet(true);
            setCurrentVote(session.participants[userId].vote);
        } else {
            setAliasSet(false);
        }
    }, [session, userId]);

    const handleSetAlias = async () => {
        if (!alias.trim()) return;
        const sessionRef = doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
        await updateDoc(sessionRef, {
            [`participants.${userId}`]: {
                alias: alias,
                vote: null,
            }
        });
        setAliasSet(true);
    };
    
    const handleSetTicket = async () => {
        if (!isFacilitator) return;
        const sessionRef = doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
        await updateDoc(sessionRef, { currentTicket: jiraTicket.trim() });
    };

    const handleVote = async (card) => {
        if (!aliasSet) return;
        const newVote = currentVote === card ? null : card;
        setCurrentVote(newVote);
        const sessionRef = doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
        await updateDoc(sessionRef, {
            [`participants.${userId}.vote`]: newVote
        });
    };

    const handleRevealVotes = async () => {
        if (!isFacilitator) return;
        const sessionRef = doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
        await updateDoc(sessionRef, { votesRevealed: true });
    };

    const handleResetVoting = async () => {
        if (!isFacilitator) return;
        const sessionRef = doc(db, `artifacts/${appId}/public/data/sessions`, sessionId);
        const participants = session?.participants || {};
        const resetParticipants = Object.keys(participants).reduce((acc, key) => {
            acc[key] = { ...participants[key], vote: null };
            return acc;
        }, {});

        await updateDoc(sessionRef, {
            participants: resetParticipants,
            votesRevealed: false,
            currentTicket: ''
        });
        setCurrentVote(null);
        setJiraTicket('');
    };

    const copyToClipboard = () => {
        const tempInput = document.createElement('input');
        tempInput.value = sessionLink;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    if (!sessionExists) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-4">
                <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                    <h1 className="text-3xl font-bold mb-4 text-red-500">Session Not Found</h1>
                    <p className="text-gray-400 mb-6">Please check the ID or create a new session.</p>
                    <button onClick={() => setSessionId(null)} className="bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-4 rounded-md">
                        Back to Lobby
                    </button>
                </div>
            </div>
        );
    }
    
    if (!session) {
        return <div className="flex items-center justify-center h-screen"><div className="text-xl">Loading session...</div></div>;
    }

    if (!aliasSet) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="w-full max-w-sm bg-gray-800 rounded-lg shadow-lg p-8">
                    <h2 className="text-2xl font-bold mb-6 text-center">Set Your Alias</h2>
                    <input
                        type="text"
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        placeholder="Enter your name or alias"
                        className="w-full p-3 bg-gray-700 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                        onClick={handleSetAlias}
                        disabled={!alias.trim()}
                        className="w-full mt-4 bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-md transition duration-300 disabled:bg-gray-500"
                    >
                        Join
                    </button>
                </div>
            </div>
        );
    }
    
    const participants = Object.entries(session.participants || {});
    // Facilitator's vote is optional, so we don't wait for them to say "All Voted"
    const votingMembers = participants.filter(([id, _]) => id !== session.createdBy);
    const allVoted = votingMembers.length > 0 && votingMembers.every(([_, p]) => p.vote !== null);
    
    const votes = participants.map(([_,p]) => p.vote).filter(v => v !== null);
    const voteCounts = votes.reduce((acc, vote) => {
        acc[vote] = (acc[vote] || 0) + 1;
        return acc;
    }, {});
    const average = votes.filter(v => !isNaN(parseInt(v))).reduce((sum, v) => sum + parseInt(v), 0) / votes.filter(v => !isNaN(parseInt(v))).length;


    return (
        <div className="container mx-auto p-4 md:p-8">
            <header className="mb-8">
                <div className="flex flex-col md:flex-row justify-between items-center">
                    <h1 className="text-3xl md:text-4xl font-bold text-teal-400 truncate max-w-lg">{session.title}</h1>
                    <div className="flex items-center mt-4 md:mt-0">
                        <span className="text-gray-400 mr-2">Session ID: {sessionId}</span>
                        <button onClick={copyToClipboard} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md text-sm transition-colors w-24">
                            {copied ? 'Copied!' : 'Copy Link'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow-lg p-6">
                    <h2 className="text-2xl font-semibold mb-6 text-center text-gray-300">
                        {session.currentTicket ? `Voting on: ` : 'Cast Your Vote'}
                        <span className="text-teal-400 font-bold">{session.currentTicket}</span>
                    </h2>
                    <div className="flex flex-wrap justify-center gap-4">
                        {votingCards.map(card => (
                            <button
                                key={card}
                                onClick={() => handleVote(card)}
                                className={`w-20 h-28 md:w-24 md:h-32 rounded-lg text-2xl md:text-3xl font-bold transition-all duration-200 flex items-center justify-center
                                ${currentVote === card ? 'bg-teal-500 text-white ring-4 ring-teal-300 transform -translate-y-2' : 'bg-gray-700 hover:bg-gray-600'}`}
                            >
                                {card}
                            </button>
                        ))}
                    </div>

                    {session.votesRevealed && (
                        <div className="mt-8 pt-6 border-t border-gray-700 text-center">
                            <h3 className="text-2xl font-bold mb-4">Results</h3>
                            <div className="flex flex-wrap justify-center gap-4">
                                {Object.entries(voteCounts).map(([vote, count]) => (
                                    <div key={vote} className="bg-gray-700 rounded-lg p-4">
                                        <span className="text-4xl font-bold text-teal-400">{vote}</span>
                                        <span className="block text-sm text-gray-400">{count} vote(s)</span>
                                    </div>
                                ))}
                            </div>
                            {!isNaN(average) && <p className="mt-4 text-xl">Average: {average.toFixed(2)}</p>}
                        </div>
                    )}
                </div>

                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    {isFacilitator && !session.votesRevealed && (
                        <div className="mb-6 pb-6 border-b border-gray-700">
                             <h3 className="text-xl font-semibold mb-2">Set Ticket for Round</h3>
                             <div className="flex gap-2">
                                 <input
                                     type="text"
                                     value={jiraTicket}
                                     onChange={(e) => setJiraTicket(e.target.value)}
                                     placeholder="e.g., PROJ-123"
                                     className="flex-grow p-2 bg-gray-700 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                 />
                                 <button onClick={handleSetTicket} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md">Set</button>
                             </div>
                        </div>
                    )}

                    <h2 className="text-2xl font-semibold mb-4">Participants ({participants.length})</h2>
                    <ul className="space-y-3">
                        {participants.map(([id, p]) => (
                            <li key={id} className="flex items-center justify-between bg-gray-700 p-3 rounded-md">
                                <span className="font-medium truncate">{p.alias} {id === session.createdBy && '(Manager)'}</span>
                                {session.votesRevealed ? (
                                    <span className="text-xl font-bold text-teal-400">{p.vote || '-'}</span>
                                ) : (
                                    <span className={`w-6 h-6 rounded-full ${p.vote ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                )}
                            </li>
                        ))}
                    </ul>
                    
                    {isFacilitator && (
                        <div className="mt-6 pt-6 border-t border-gray-700 space-y-3">
                            <h3 className="text-xl font-semibold mb-2">Manager Controls</h3>
                            <button
                                onClick={handleRevealVotes}
                                disabled={session.votesRevealed}
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-500"
                            >
                                {session.votesRevealed ? 'Votes Revealed' : `Reveal Votes (${allVoted ? 'All Voted' : 'Force'})`}
                            </button>
                            <button
                                onClick={handleResetVoting}
                                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md"
                            >
                                New Voting Round
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
