const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath);
});

// --- NOVA ROTA: LER NOMES DO ARQUIVO ---
app.get('/names', (req, res) => {
    const namesFile = path.join(__dirname, 'names.txt');
    
    if (fs.existsSync(namesFile)) {
        try {
            const data = fs.readFileSync(namesFile, 'utf8');
            // Quebra por linha, remove espaços e linhas vazias
            const namesList = data.split('\n').map(n => n.trim()).filter(n => n.length > 0);
            res.json(namesList);
        } catch (err) {
            console.error("Erro ao ler names.txt:", err);
            res.json(["Jogador Desconhecido"]);
        }
    } else {
        // Fallback se o arquivo não existir
        res.json(["Michael", "Franklin", "Trevor", "CJ", "Tommy Vercetti"]);
    }
});

// --- SISTEMA DE MEMÓRIA DA IA ---
const MEMORY_FILE = 'ai_memory.json';
let aiMemory = {};

if (fs.existsSync(MEMORY_FILE)) {
    try {
        aiMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
        console.log("🧠 Memória da IA carregada.");
    } catch (err) {
        aiMemory = {};
    }
} else {
    aiMemory = {};
}

function saveAiMemory() {
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(aiMemory, null, 2));
    } catch (err) {
        console.error("Erro ao salvar memória:", err);
    }
}

// --- DADOS DO JOGO ---
let rooms = {};

const winningCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function checkWin(board, player) {
    if (!board) return false;
    for (const combo of winningCombos) {
        if (combo.every(index => board[index] === player)) return true;
    }
    return false;
}

function checkDraw(board) {
    if (!board) return false;
    return board.every(cell => cell !== null && cell !== '');
}

// --- LÓGICA MINIMAX (NÍVEL DEUS) ---
const MAX_DEPTH = 4; 

function getBestMove(state, botSymbol, roomName) {
    const opponentSymbol = (botSymbol === 'X' ? 'O' : 'X');
    
    // Recupera memória
    const room = rooms[roomName];
    let isAngry = false;
    if (room && room.players.length > 0) {
        const playerName = room.players[0].name;
        if (aiMemory[playerName] && aiMemory[playerName].lastOutcome === 'lose') {
            isAngry = true; 
        }
    }

    // Executa Minimax
    const result = minimax(state, MAX_DEPTH, -Infinity, Infinity, true, botSymbol, opponentSymbol, isAngry);
    
    if (!result.move) {
        const valid = getValidMoves(state);
        return valid[0] || { bigIndex: 0, smallIndex: 0 };
    }

    return result.move;
}

function minimax(state, depth, alpha, beta, isMaximizing, botSymbol, oppSymbol, isAngry) {
    const score = evaluateState(state, botSymbol, oppSymbol);
    
    if (Math.abs(score) > 10000) return { score: score }; 
    if (depth === 0) return { score: score };

    const validMoves = getValidMoves(state);
    if (validMoves.length === 0) return { score: score };

    let bestMove = null;

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of validMoves) {
            const newState = simulateMove(state, move, botSymbol);
            const evalObj = minimax(newState, depth - 1, alpha, beta, false, botSymbol, oppSymbol, isAngry);
            const evalScore = evalObj.score;

            if (evalScore > maxEval) {
                maxEval = evalScore;
                bestMove = move;
            }
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
        }
        return { score: maxEval, move: bestMove };
    } else {
        let minEval = Infinity;
        for (const move of validMoves) {
            const newState = simulateMove(state, move, oppSymbol);
            const evalObj = minimax(newState, depth - 1, alpha, beta, true, botSymbol, oppSymbol, isAngry);
            const evalScore = evalObj.score;

            if (evalScore < minEval) {
                minEval = evalScore;
                bestMove = move;
            }
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return { score: minEval, move: bestMove };
    }
}

function getValidMoves(state) {
    let moves = [];
    let targets = [];

    if (state.nextAllowed !== -1 && state.bigBoardStatus[state.nextAllowed] === null) {
        targets.push(state.nextAllowed);
    } else {
        for (let i = 0; i < 9; i++) {
            if (state.bigBoardStatus[i] === null) targets.push(i);
        }
    }

    for (const b of targets) {
        for (let s = 0; s < 9; s++) {
            if (state.boards[b][s] === '') {
                moves.push({ bigIndex: b, smallIndex: s });
            }
        }
    }
    return moves;
}

function simulateMove(state, move, player) {
    const newBoards = state.boards.map(arr => [...arr]);
    const newBigStatus = [...state.bigBoardStatus];
    
    newBoards[move.bigIndex][move.smallIndex] = player;

    if (checkWin(newBoards[move.bigIndex], player)) {
        newBigStatus[move.bigIndex] = player;
    } else if (checkDraw(newBoards[move.bigIndex])) {
        newBigStatus[move.bigIndex] = 'draw';
    }

    return {
        boards: newBoards,
        bigBoardStatus: newBigStatus,
        nextAllowed: move.smallIndex
    };
}

function evaluateState(state, bot, opp) {
    if (checkWin(state.bigBoardStatus, bot)) return 100000;
    if (checkWin(state.bigBoardStatus, opp)) return -100000;
    if (checkDraw(state.bigBoardStatus)) return 0;

    let score = 0;

    for (let i = 0; i < 9; i++) {
        if (state.bigBoardStatus[i] === bot) score += 200;
        else if (state.bigBoardStatus[i] === opp) score -= 200;
        else if (state.bigBoardStatus[i] === null) {
            score += evaluateSmallBoard(state.boards[i], bot, opp);
        }
    }

    const centerBig = state.bigBoardStatus[4];
    if (centerBig === bot) score += 150;
    if (centerBig === opp) score -= 150;

    return score;
}

function evaluateSmallBoard(board, bot, opp) {
    let score = 0;
    const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];

    for (const line of lines) {
        const c1 = board[line[0]];
        const c2 = board[line[1]];
        const c3 = board[line[2]];

        const botCount = (c1===bot?1:0) + (c2===bot?1:0) + (c3===bot?1:0);
        const oppCount = (c1===opp?1:0) + (c2===opp?1:0) + (c3===opp?1:0);

        if (botCount === 2 && oppCount === 0) score += 10;
        if (oppCount === 2 && botCount === 0) score -= 10;
        if (botCount === 1 && oppCount === 0) score += 1;
        if (oppCount === 1 && botCount === 0) score -= 1;
    }
    
    if (board[4] === bot) score += 2;
    if (board[4] === opp) score -= 2;

    return score;
}

function updateAiMemory(room, winner) {
    if (!room || room.players.length === 0) return;
    const playerName = room.players[0].name;
    
    if (!aiMemory[playerName]) aiMemory[playerName] = { wins: 0, losses: 0, draws: 0, lastOutcome: null };

    if (winner === 'O') { 
        aiMemory[playerName].lastOutcome = 'win';
        aiMemory[playerName].losses++; 
    } else if (winner === 'X') { 
        aiMemory[playerName].lastOutcome = 'lose';
        aiMemory[playerName].wins++; 
    } else {
        aiMemory[playerName].lastOutcome = 'draw';
        aiMemory[playerName].draws++;
    }
    saveAiMemory();
}

io.on('connection', (socket) => {
    console.log(`[CONEXÃO] ID: ${socket.id}`);
    socket.emit('roomListUpdate', getRoomList());

    socket.on('getRooms', () => socket.emit('roomListUpdate', getRoomList()));

    socket.on('initAiGame', ({ roomName, playerName, difficulty }) => {
        rooms[roomName] = {
            name: roomName,
            type: 'ai',
            difficulty: difficulty,
            players: [{ id: socket.id, role: 'X', name: playerName }],
            boardState: Array(9).fill(null).map(() => Array(9).fill('')), 
            bigBoardStatus: Array(9).fill(null),
            turn: 'X',
            nextAllowed: -1,
            chatHistory: [],
            aiGodLastGameOutcome: null
        };
        socket.join(roomName);
        console.log(`[AI] Sala criada: ${roomName} (${difficulty})`);
        socket.emit('aiGameInitialized', { roomName });
        io.emit('roomListUpdate', getRoomList());
    });

    socket.on('joinGame', ({ roomName, playerName }) => {
        if (!rooms[roomName]) {
            rooms[roomName] = {
                name: roomName,
                type: 'multi',
                players: [],
                boardState: Array(9).fill(null).map(() => Array(9).fill('')), 
                bigBoardStatus: Array(9).fill(null),
                turn: 'X',
                nextAllowed: -1,
                chatHistory: [],
                aiGodLastGameOutcome: null
            };
        }
        const room = rooms[roomName];

        if (room.players.length >= 2) {
            socket.emit('errorMsg', 'Sala cheia!');
            return;
        }

        let role = 'X';
        if (room.players.length === 1) role = room.players[0].role === 'X' ? 'O' : 'X';

        room.players.push({ id: socket.id, role, name: playerName });
        socket.join(roomName);
        socket.emit('init', { room: roomName, role: role, chatHistory: room.chatHistory });

        if (room.players.length === 2) {
            const names = {};
            room.players.forEach(p => names[p.role] = p.name);
            io.to(roomName).emit('gameStart', { names });
        }
        io.emit('roomListUpdate', getRoomList());
    });

    socket.on('joinSpectator', ({ roomName, playerName }) => {
        const room = rooms[roomName];
        if (!room) {
            socket.emit('errorMsg', 'Sala não encontrada.');
            return;
        }
        socket.join(roomName);
        
        const names = {};
        if (room.type === 'ai') {
            names['X'] = room.players[0].name;
            names['O'] = room.difficulty === 'god' ? 'Esposa (IA)' : (room.difficulty === 'hard' ? 'Namorada (IA)' : 'A do Job (IA)');
        } else {
            if(room.players.length > 0) room.players.forEach(p => names[p.role] = p.name);
            else { names['X'] = '???'; names['O'] = '???'; }
        }

        socket.emit('spectatorGameState', {
            bigBoardStatus: room.bigBoardStatus,
            boardState: room.boardState,
            playerNames: names,
            currentTurn: room.turn,
            nextAllowed: room.nextAllowed,
            chatHistory: room.chatHistory
        });
    });

    socket.on('move', (data) => {
        const room = rooms[data.room];
        if (!room) return;

        if (room.boardState[data.bigBoardIndex][data.smallCellIndex] !== '') return;

        room.boardState[data.bigBoardIndex][data.smallCellIndex] = data.player;
        room.nextAllowed = data.smallCellIndex;

        if (checkWin(room.boardState[data.bigBoardIndex], data.player)) {
            room.bigBoardStatus[data.bigBoardIndex] = data.player;
        } else if (checkDraw(room.boardState[data.bigBoardIndex])) {
            room.bigBoardStatus[data.bigBoardIndex] = 'draw';
        }

        let gameWinner = null;
        if (checkWin(room.bigBoardStatus, data.player)) gameWinner = data.player;
        else if (checkDraw(room.bigBoardStatus)) gameWinner = 'draw';

        room.turn = (data.player === 'X' ? 'O' : 'X');

        if (data.room.startsWith('ai_game_') && gameWinner) {
            updateAiMemory(room, gameWinner);
        }

        io.to(data.room).emit('updateBoard', {
            bigBoardIndex: data.bigBoardIndex,
            smallCellIndex: data.smallCellIndex,
            player: data.player,
            gameWinner: gameWinner,
            room: data.room
        });
    });

    socket.on('chatMessage', ({ room, sender, message }) => {
        const currentRoom = rooms[room];
        if (currentRoom) {
            const chatMsg = { sender, message };
            currentRoom.chatHistory.push(chatMsg);
            if (currentRoom.chatHistory.length > 50) currentRoom.chatHistory.shift();
            io.to(room).emit('chatMessage', chatMsg);
        }
    });

    socket.on('requestAiMove', ({ gameState, botSymbol, roomName }) => {
        const room = rooms[roomName];
        if (!room) return;

        const bestMove = getBestMove(gameState, botSymbol, roomName);
        
        room.boardState[bestMove.bigIndex][bestMove.smallIndex] = botSymbol;
        room.nextAllowed = bestMove.smallIndex;

        if (checkWin(room.boardState[bestMove.bigIndex], botSymbol)) {
            room.bigBoardStatus[bestMove.bigIndex] = botSymbol;
        } else if (checkDraw(room.boardState[bestMove.bigIndex])) {
            room.bigBoardStatus[bestMove.bigIndex] = 'draw';
        }

        let gameWinner = null;
        if (checkWin(room.bigBoardStatus, botSymbol)) gameWinner = botSymbol;
        else if (checkDraw(room.bigBoardStatus)) gameWinner = 'draw';

        if (gameWinner) {
            updateAiMemory(room, gameWinner);
        }

        // CORREÇÃO: Avisa TODOS na sala (incluindo espectadores)
        io.to(roomName).emit('updateBoard', { 
            bigBoardIndex: bestMove.bigIndex, 
            smallCellIndex: bestMove.smallIndex,
            player: botSymbol,
            gameWinner: gameWinner,
            room: roomName
        });
    });

    socket.on('disconnect', () => {
        for (const rName in rooms) {
            const room = rooms[rName];
            const pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                const leaver = room.players[pIndex];
                room.players.splice(pIndex, 1);
                io.to(rName).emit('playerLeft', { leaverName: leaver.name });
                if (room.players.length === 0) delete rooms[rName];
                io.emit('roomListUpdate', getRoomList());
                break;
            }
        }
    });
});

function getRoomList() {
    const list = [];
    for (const key in rooms) {
        const room = rooms[key];
        if (!key.startsWith('ai_game_') && room.players.length > 0) {
            list.push({ id: key, name: room.name, type: 'multi', players: room.players.length });
        }
        else if (key.startsWith('ai_game_') && room.players.length > 0) {
            const playerName = room.players[0].name;
            let diffName = room.difficulty === 'god' ? 'Esposa' : (room.difficulty === 'hard' ? 'Namorada' : 'A do Job');
            list.push({ id: key, name: `🤖 IA (${diffName}) vs ${playerName}`, type: 'ai', players: room.players.length });
        }
    }
    return list;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVIDOR RODANDO na porta ${PORT}`);
});