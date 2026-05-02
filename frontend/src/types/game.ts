export type PieceColor = 'white' | 'black';
export type PieceType = 'man' | 'dama';
export type RulesType = 'russian' | 'international' | 'english';
export type GameStatus = 'pending' | 'active' | 'completed' | 'abandoned';

export interface Piece { color: PieceColor; type: PieceType; }
export interface Position { row: number; col: number; }
export interface Move { from: Position; to: Position; captures: Position[]; promotion: boolean; }

export interface BoardState {
  board: (Piece | null)[][];
  currentTurn: PieceColor;
  rulesType: RulesType;
  boardSize: number;
  moveCount: number;
  captureCount: number;
}

export interface Game {
  id: string;
  playerWhite: User;
  playerBlack: User;
  rulesType: RulesType;
  status: GameStatus;
  boardState: BoardState;
  winner?: User;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  isOnline?: boolean;
  rating?: { rating: number; rd: number; gamesPlayed: number; wins: number; losses: number; draws: number; };
}

export interface ChatMessage {
  senderId: string;
  senderName?: string;
  content: string;
  timestamp: string;
}
