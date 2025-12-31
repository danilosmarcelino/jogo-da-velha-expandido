// Inicialização segura do Socket
let socket;
try {
    socket = io();
    console.log("Socket inicializado.");
} catch (e) {
    console.error("Erro socket:", e);
    alert("Erro crítico de conexão.");
}

// Elementos
const getEl = (id) => document.getElementById(id);
const gameContainer = getEl('game-container');
const myRoleDisplay = getEl('my-role');
const turnDisplay = getEl('current-turn');
const statusMsg = getEl('status-msg');
const menu = getEl('menu');
const gameWrapper = getEl('game-wrapper'); // NOVO CONTAINER DO JOGO
const restartBtn = getEl('restart-btn');
const aiLevelSelect = getEl('ai-level');
const roomInput = getEl('room-name'); 
const aiNameInput = getEl('player-nickname-ai');
const symbolChoice = getEl('player-symbol-choice'); 
const roomDisplay = getEl('room-display');
const chatPanel = getEl('chat-panel');
const chatMessagesDiv = getEl('chat-messages');
const chatInput = getEl('chat-input');
const sendChatBtn = getEl('send-chat-btn');

// Estado
let gameMode = ''; 
let myRole = 'X'; 
let currentTurn = 'X';
let nextAllowedBoard = -1; 
let isGameActive = false; 
let isSpectator = false;
let bigBoardStatus = Array(9).fill(null); 
let aiDifficulty = 'easy'; 
let currentRoom = null; 
let playerNames = { 'X': 'X', 'O': 'O' }; 
let myNickname = ''; 
let lastMoveElement = null; 

const winningCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const finaisDeJogo = {
    'easy': { vitoriaIA: { img: 'imagens/mulher_beijo.png', anim: 'anim-fade-out' }, derrotaIA: { img: 'imagens/mulher_surpresa.png', anim: 'anim-zoom-in' } },
    'hard': { vitoriaIA: { img: 'imagens/mulher_sofa.png', anim: 'anim-slide-left' }, derrotaIA: { img: 'imagens/mulher_carro.png', anim: 'anim-pulse' } },
    'god': { vitoriaIA: { img: 'imagens/mulher_furiosa.png', anim: 'anim-shake' }, derrotaIA: { img: 'imagens/mulher_feliz.png', anim: 'anim-heart-beat' } }
};

// --- SISTEMA DE NOMES ---
let historicalPersonalities = ["Visitante"]; 

fetch('/names')
    .then(response => response.json())
    .then(data => {
        if (data && data.length > 0) {
            historicalPersonalities = data;
            console.log("Nomes carregados:", historicalPersonalities.length);
        }
    })
    .catch(err => console.error("Erro ao carregar nomes:", err));

function getRandomPersonality() { 
    return historicalPersonalities[Math.floor(Math.random() * historicalPersonalities.length)]; 
}

function promptForNickname() {
    let name = prompt("Digite seu apelido (ou deixe vazio para aleatório):", "");
    return (name && name.trim()) ? name.trim() : getRandomPersonality();
}

// Event Listeners
if(sendChatBtn) sendChatBtn.addEventListener('click', sendChatMessage);
if(chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

// Funções Globais
window.requestRoomList = function() { 
    if(socket && socket.connected) socket.emit('getRooms'); 
};

window.joinSpecificRoom = function(rName) {
    document.getElementById('room-name').value = rName;
    myNickname = promptForNickname();
    startGame('online');
};

window.watchRoom = function(roomId, roomNameDisplay) {
    myNickname = promptForNickname();
    menu.classList.add('hidden');
    gameWrapper.classList.remove('hidden'); // MOSTRA O JOGO
    restartBtn.classList.remove('hidden');
    chatPanel.classList.remove('hidden');
    createBoard();
    isSpectator = true; 
    currentRoom = roomId; 
    myRoleDisplay.innerText = `ESPECTADOR (${myNickname})`;
    roomDisplay.innerText = roomNameDisplay; 
    statusMsg.innerText = "Sincronizando...";
    if(socket) socket.emit('joinSpectator', { roomName: roomId, playerName: myNickname });
};

window.viewBoard = function() {
    const modal = getEl('game-over-modal');
    modal.classList.add('hidden');
    
    const statusMsg = getEl('status-msg');
    statusMsg.innerText = "JOGO FINALIZADO. CLIQUE EM SAIR.";
    statusMsg.style.color = "#e74c3c"; 
    
    const restartBtn = getEl('restart-btn');
    restartBtn.classList.remove('hidden');
    restartBtn.style.animation = "pulse 2s infinite"; 
};

window.startGame = function(mode) {
    console.log("Iniciando:", mode);
    lastMoveElement = null; 
    gameMode = mode;
    aiDifficulty = aiLevelSelect.value;
    isSpectator = false;
    document.body.classList.remove('urgent-turn');
    
    menu.classList.add('hidden');
    gameWrapper.classList.remove('hidden'); // MOSTRA O JOGO
    restartBtn.classList.remove('hidden');
    createBoard();
    isGameActive = true;
    currentTurn = 'X'; 
    nextAllowedBoard = -1;
    bigBoardStatus.fill(null);

    if (mode === 'online') {
        if (!myNickname) myNickname = promptForNickname();
    } else {
        let tempName = aiNameInput.value.trim();
        myNickname = tempName || getRandomPersonality();
    }
    myRoleDisplay.innerText = `${myRole} (${myNickname})`;

    if (mode === 'online') {
        const roomName = roomInput.value.trim();
        if (!roomName) { alert("Nome da sala obrigatório!"); location.reload(); return; }
        statusMsg.innerText = "Conectando...";
        chatPanel.classList.remove('hidden');
        if(socket) socket.emit('joinGame', { roomName: roomName, playerName: myNickname });
    } 
    else if (mode === 'ai') {
        let botName = aiDifficulty === 'easy' ? "A do Job" : (aiDifficulty === 'hard' ? "Namorada" : "Esposa");
        const chosenSymbol = symbolChoice.value;
        myRole = chosenSymbol;
        playerNames = myRole === 'X' ? { 'X': myNickname, 'O': botName } : { 'X': botName, 'O': myNickname };
        
        myRoleDisplay.innerText = `${myRole} (${myNickname})`;
        statusMsg.innerText = myRole === 'X' ? "Sua vez!" : `Vez da ${botName}...`;
        chatPanel.classList.add('hidden');
        updateTurnDisplay();
        updateVisuals();

        if(socket) {
            currentRoom = `ai_game_${socket.id}`;
            console.log("Criando sala IA:", currentRoom);
            socket.emit('initAiGame', { roomName: currentRoom, playerName: myNickname, difficulty: aiDifficulty });
        }

        if (myRole === 'O') setTimeout(botMakeMove, 1000);
    }
}

// Socket Handlers
if(socket) {
    socket.on('connect', () => { window.requestRoomList(); });
    socket.on('roomListUpdate', (rooms) => {
        const container = document.getElementById('room-list-container');
        if(!container) return;
        container.innerHTML = ''; 
        if (!rooms || rooms.length === 0) {
            container.innerHTML = '<p style="color:#555;text-align:center;">NENHUM SINAL ENCONTRADO.</p>';
            return;
        }
        rooms.forEach(room => {
            const item = document.createElement('div');
            item.className = 'room-item';
            
            let html = `<div class="room-info"><span class="room-name">${room.name}</span>`;
            
            if (room.type === 'multi' && room.players < 2) {
                html += `<span class="room-status status-waiting">AGUARDANDO</span></div>`;
                html += `<button class="btn-join-room" onclick="window.joinSpecificRoom('${room.name}')">JOGAR</button>`;
            } else {
                html += `<span class="room-status status-playing">EM ANDAMENTO</span></div>`;
                html += `<button class="btn-watch-room" onclick="window.watchRoom('${room.id}', '${room.name}')">ASSISTIR</button>`;
            }
            item.innerHTML = html;
            container.appendChild(item);
        });
    });

    socket.on('init', (data) => {
        currentRoom = data.room; myRole = data.role; isSpectator = false;
        myRoleDisplay.innerText = `${myRole} (${myNickname})`;
        roomDisplay.innerText = currentRoom; statusMsg.innerText = "AGUARDANDO OPONENTE...";
        chatMessagesDiv.innerHTML = '';
        if(data.chatHistory) data.chatHistory.forEach(msg => displayChatMessage(msg.sender, msg.message));
        updateVisuals();
    });

    socket.on('gameStart', (data) => {
        playerNames = data.names; isGameActive = true; currentTurn = 'X';
        updateTurnDisplay(); statusMsg.innerText = "MISSÃO INICIADA!";
        if(!isSpectator && playerNames[myRole]) myRoleDisplay.innerText = `${myRole} (${playerNames[myRole]})`;
        updateVisuals();
    });

    socket.on('spectatorGameState', (data) => {
        bigBoardStatus = data.bigBoardStatus; playerNames = data.playerNames;
        currentTurn = data.currentTurn; nextAllowedBoard = data.nextAllowed;
        isGameActive = true;
        updateBoardFromState(data.boardState);
        updateTurnDisplay(); updateVisuals();
        statusMsg.innerText = "MODO ESPECTADOR";
        chatMessagesDiv.innerHTML = '';
        if(data.chatHistory) data.chatHistory.forEach(msg => displayChatMessage(msg.sender, msg.message));
    });

    socket.on('updateBoard', (data) => {
        if (currentRoom && data.room !== currentRoom) return;
        
        executeMove(data.bigBoardIndex, data.smallCellIndex, data.player);
        if (data.gameWinner) showGameOver(data.gameWinner);

        if (gameMode === 'ai' && isGameActive && data.player === myRole) {
            setTimeout(botMakeMove, 800);
        }
    });

    socket.on('aiMoveResult', (data) => {
        console.log("IA Moveu:", data);
        executeMove(data.bigBoardIndex, data.smallCellIndex, currentTurn);
        if (data.gameWinner) showGameOver(data.gameWinner);
    });

    socket.on('playerLeft', (data) => {
        if (isSpectator) {
            statusMsg.innerText = "ALVO PERDIDO. SAINDO...";
            setTimeout(() => location.reload(), 3000);
        } else {
            showOpponentLeft(data.leaverName);
        }
    });

    socket.on('chatMessage', (data) => displayChatMessage(data.sender, data.message));
    socket.on('errorMsg', (msg) => { alert(msg); location.reload(); });
}

// Core Logic
function createBoard() {
    gameContainer.innerHTML = ''; 
    for (let i = 0; i < 9; i++) {
        const bigCell = document.createElement('div');
        bigCell.className = 'small-board'; bigCell.dataset.bigIndex = i;
        for (let j = 0; j < 9; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell'; cell.dataset.smallIndex = j;
            cell.onclick = () => handleCellClick(i, j);
            bigCell.appendChild(cell);
        }
        gameContainer.appendChild(bigCell);
    }
}

function updateBoardFromState(boardState) {
    for(let i=0; i < 9; i++) {
        for(let j=0; j < 9; j++) {
            const val = boardState[i][j];
            if (val) {
                const cell = getCell(i, j);
                if (cell) { cell.innerText = val; cell.classList.add('taken'); }
            }
        }
        if (bigBoardStatus[i]) markBoardWon(i, bigBoardStatus[i]);
    }
}

function handleCellClick(big, small) {
    if (isSpectator || !isGameActive) return;
    if (gameMode === 'ai' && currentTurn !== myRole) return;
    if (gameMode === 'online' && myRole !== currentTurn) return;
    
    if (bigBoardStatus[big] !== null) return;
    if (nextAllowedBoard !== -1 && nextAllowedBoard !== big && isBoardPlayable(nextAllowedBoard)) return;
    const cell = getCell(big, small);
    if (cell.innerText !== '') return;

    if (socket) {
        socket.emit('move', { room: currentRoom, bigBoardIndex: big, smallCellIndex: small, player: myRole });
    }
}

function executeMove(big, small, player) {
    const cell = getCell(big, small); 
    if(!cell) return;

    if (lastMoveElement) {
        lastMoveElement.classList.remove('last-move');
    }

    cell.innerText = player; 
    cell.classList.add('taken');
    
    cell.classList.add('last-move');
    lastMoveElement = cell;

    checkSmallBoardWin(big, player);
    
    if (gameMode === 'ai' && aiDifficulty !== 'god') checkBigGameWin(player);

    if (isGameActive) {
        currentTurn = currentTurn === 'X' ? 'O' : 'X';
        updateTurnDisplay();
        nextAllowedBoard = parseInt(small);
        updateVisuals();
    }
}

function botMakeMove() {
    if (!isGameActive || currentTurn === myRole) return;
    
    if (aiDifficulty === 'god') {
        const gameState = { boards: [], bigBoardStatus: bigBoardStatus, nextAllowed: nextAllowedBoard };
        for(let i=0; i < 9; i++) gameState.boards.push(Array.from(gameContainer.children[i].children).map(c => c.innerText));
        socket.emit('requestAiMove', { gameState: gameState, botSymbol: currentTurn, roomName: currentRoom });
        return;
    }

    let target = (nextAllowedBoard !== -1 && isBoardPlayable(nextAllowedBoard)) ? nextAllowedBoard : -1;
    if (target === -1) {
        const playable = getAllPlayableBoards();
        if (playable.length === 0) return;
        target = playable[Math.floor(Math.random() * playable.length)];
    }

    const emptyCells = Array.from(gameContainer.children[target].children)
        .map((c, i) => ({c, i})).filter(o => o.c.innerText === '');
        
    if (emptyCells.length > 0) {
        const move = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        socket.emit('move', { room: currentRoom, bigBoardIndex: target, smallCellIndex: move.i, player: currentTurn });
    }
}

function checkSmallBoardWin(big, player) {
    const cells = Array.from(gameContainer.children[big].children).map(c => c.innerText);
    if (winningCombos.some(c => c.every(i => cells[i] === player))) {
        markBoardWon(big, player); bigBoardStatus[big] = player;
    } else if (cells.every(c => c !== '')) {
        markBoardWon(big, 'draw'); bigBoardStatus[big] = 'draw';
    }
}

function markBoardWon(big, winner) {
    const div = gameContainer.children[big];
    div.classList.add(winner === 'X' ? 'won-x' : 'won-o');
    div.innerText = winner === 'draw' ? '#' : winner;
}

function checkBigGameWin(player) {
    if (winningCombos.some(c => c.every(i => bigBoardStatus[i] === player))) showGameOver(player);
    else if (bigBoardStatus.every(s => s !== null)) showGameOver('draw');
}

function showGameOver(winner) {
    isGameActive = false;
    document.body.classList.remove('urgent-turn');
    
    const modal = getEl('game-over-modal');
    const modalContent = modal.querySelector('.modal-content');
    const endTitle = getEl('end-title');
    const endSymbol = getEl('end-symbol');
    const endName = getEl('end-name');
    const aiReactionImg = getEl('ai-reaction-img');

    modal.classList.remove('hidden');
    modalContent.classList.remove('win-x', 'win-o', 'draw');
    
    endTitle.innerText = ""; 
    endSymbol.innerText = ""; 
    endName.innerText = "";
    aiReactionImg.classList.add('hidden');

    if (gameMode === 'ai') {
        if (winner === myRole) {
            endTitle.innerText = "MISSION PASSED";
            endSymbol.innerText = "RESPECT +";
            endName.innerText = `${myNickname} dominou a máquina!`;
            modalContent.classList.add('win-x');
            const data = finaisDeJogo[aiDifficulty]['derrotaIA'];
            aiReactionImg.src = data.img; 
            aiReactionImg.className = `cartoon-img ${data.anim}`;
            aiReactionImg.classList.remove('hidden');
        } else if (winner !== 'draw') {
            endTitle.innerText = "WASTED";
            endSymbol.innerText = "ELIMINADO";
            endName.innerText = aiDifficulty === 'easy' ? "A do job te pegou!" : (aiDifficulty === 'hard' ? "A namorada venceu!" : "A Esposa não perdoa!");
            modalContent.classList.add('win-o');
            const data = finaisDeJogo[aiDifficulty]['vitoriaIA'];
            aiReactionImg.src = data.img; 
            aiReactionImg.className = `cartoon-img ${data.anim}`;
            aiReactionImg.classList.remove('hidden');
        } else {
            endTitle.innerText = "BUSTED";
            endSymbol.innerText = "SEM VENCEDOR";
            endName.innerText = "Ninguém levou essa.";
            modalContent.classList.add('draw');
        }
    } else {
        if (winner === 'draw') {
            endTitle.innerText = "EMPATE";
            endSymbol.innerText = "#";
            endName.innerText = "Jogo travado.";
            modalContent.classList.add('draw');
        } else {
            endTitle.innerText = "MISSION PASSED";
            endSymbol.innerText = "VENCEDOR";
            endName.innerText = `${playerNames[winner] || winner} conquistou o território!`;
            modalContent.classList.add(winner === 'X' ? 'win-x' : 'win-o');
        }
    }
}

function showOpponentLeft(leaverName) {
    isGameActive = false;
    document.body.classList.remove('urgent-turn');
    
    const modal = getEl('game-over-modal');
    modal.classList.remove('hidden', 'win-x', 'win-o', 'draw');
    modal.classList.add('anim-zoom-in');
    getEl('end-title').innerText = "Oponente Abandonou!";
    getEl('end-symbol').classList.add('hidden');
    getEl('ai-reaction-img').classList.add('hidden');
    getEl('end-name').innerHTML = `O adversário <strong>${leaverName}</strong> saiu.<br>Você venceu!`;
}

function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (msg && currentRoom && socket) {
        socket.emit('chatMessage', { room: currentRoom, sender: myNickname, message: msg });
        chatInput.value = '';
    }
}

function displayChatMessage(sender, msg) {
    const p = document.createElement('p');
    p.className = 'chat-message';
    p.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatMessagesDiv.appendChild(p);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Helpers
function isBoardPlayable(i) { return bigBoardStatus[i] === null && Array.from(gameContainer.children[i].children).some(c => c.innerText === ''); }
function getCell(b, s) { return gameContainer.children[b]?.children[s]; }
function getAllPlayableBoards() { return bigBoardStatus.map((v, i) => v === null && isBoardPlayable(i) ? i : -1).filter(i => i !== -1); }
function updateTurnDisplay() { turnDisplay.innerText = `${currentTurn} (${playerNames[currentTurn] || currentTurn})`; }

function updateVisuals() {
    Array.from(gameContainer.children).forEach(b => b.classList.remove('active-target'));
    
    document.body.classList.remove('urgent-turn');
    if (isGameActive && !isSpectator && currentTurn === myRole) {
        document.body.classList.add('urgent-turn');
    }

    if (!isGameActive && !isSpectator) return;
    let t = nextAllowedBoard;
    if (t !== -1 && !isBoardPlayable(t)) t = -1;
    if (t !== -1) gameContainer.children[t].classList.add('active-target');
}