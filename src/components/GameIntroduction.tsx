import React from 'react'
import { Gem, Users, Trophy, Map, Zap, Target } from 'lucide-react'

interface GameIntroductionProps {
  onEnterLobby: () => void
}

export const GameIntroduction: React.FC<GameIntroductionProps> = ({ onEnterLobby }) => {
  return (
    <div className="w-full max-w-4xl space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <div className="space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 leading-tight">
            Strategic Treasure Hunting Adventure
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Compete with friends to discover hidden relics while managing limited resources and using strategic intelligence to maximize your treasure discoveries.
          </p>
        </div>
        
        <button
          onClick={onEnterLobby}
          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-600 to-amber-600 text-white text-lg font-semibold rounded-xl shadow-lg hover:from-emerald-700 hover:to-amber-700 transform hover:scale-105 transition-all duration-200"
        >
          <Users className="w-6 h-6" />
          Enter Game Lobby
        </button>
      </div>

      {/* Game Features */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-emerald-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Users className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Multiplayer Competition</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Join friends with simple 6-character game codes. Race to find treasures first for maximum points while competing on the same treasure layout.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-amber-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Map className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Strategic Intelligence</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Use the heat map system to see where other players have found treasures. Plan your moves based on discovery gaps and territorial intelligence.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-purple-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Resource Management</h3>
          </div>
          <p className="text-gray-600 text-sm">
            Balance risk and reward with limited dig attempts. Finding treasures grants bonus digs, but each move counts toward your final score.
          </p>
        </div>
      </div>

      {/* How to Play */}
      <div className="bg-white p-8 rounded-xl shadow-lg">
        <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">How to Play</h3>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Create or Join Game</h4>
                <p className="text-gray-600 text-sm">Start a new game and share the code, or join an existing game with a friend's code.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Strategic Digging</h4>
                <p className="text-gray-600 text-sm">Use your limited dig attempts wisely. Each treasure found grants a bonus dig attempt.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-1">Use Intelligence</h4>
                <p className="text-gray-600 text-sm">Watch the heat map for areas where others found treasures you haven't discovered yet.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 p-4 rounded-lg border border-amber-200">
              <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                Scoring System
              </h4>
              <div className="space-y-1 text-sm text-amber-700">
                <div className="flex justify-between">
                  <span>1st Discovery:</span>
                  <span className="font-bold">100 points</span>
                </div>
                <div className="flex justify-between">
                  <span>2nd Discovery:</span>
                  <span className="font-bold">80 points</span>
                </div>
                <div className="flex justify-between">
                  <span>3rd Discovery:</span>
                  <span className="font-bold">60 points</span>
                </div>
                <div className="flex justify-between">
                  <span>4th Discovery:</span>
                  <span className="font-bold">40 points</span>
                </div>
                <div className="flex justify-between">
                  <span>5th Discovery:</span>
                  <span className="font-bold">20 points</span>
                </div>
                <div className="flex justify-between">
                  <span>6th+ Discovery:</span>
                  <span className="font-bold">0 points</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-emerald-50 p-4 rounded-lg border border-emerald-200">
              <h4 className="font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Pro Tips
              </h4>
              <ul className="space-y-1 text-sm text-emerald-700">
                <li>• Early discoveries are worth more points</li>
                <li>• Finding treasures grants bonus dig attempts</li>
                <li>• Use heat map hints to find treasure-rich areas</li>
                <li>• Balance aggressive exploration with strategic patience</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="text-center">
        <button
          onClick={onEnterLobby}
          className="inline-flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-emerald-600 to-amber-600 text-white text-xl font-bold rounded-xl shadow-xl hover:from-emerald-700 hover:to-amber-700 transform hover:scale-105 transition-all duration-200"
        >
          <Gem className="w-7 h-7" />
          Start Your Treasure Hunt
        </button>
        <p className="text-gray-500 text-sm mt-3">
          Ready to discover hidden relics and compete with friends?
        </p>
      </div>
    </div>
  )
}