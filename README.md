# Relic Rush

A strategic treasure hunting game where players dig for hidden relics while managing limited resources and competing for high scores through intelligent gameplay and tactical decision-making.

## Game Overview

Relic Rush is an engaging treasure hunting game that combines resource management, strategic thinking, and competitive multiplayer elements. Players must carefully balance risk and reward while using environmental clues to maximize their treasure discoveries on a grid-based board.

## Core Game Mechanics

### Board and Setup
- **Dynamic Grid Sizes**: Choose from 6x6, 9x9, or 12x12 grids for varying complexity
- **Treasure Distribution**: Configurable treasure count (1 to 1/3 of total squares)
- **Resource Management**: Limited dig attempts with strategic bonus mechanics
- **Real-time Multiplayer**: Shared treasure layouts with competitive scoring

### Digging and Discovery System
- **Dig Consumption**: Each dig attempt consumes one action from your limited pool
- **Treasure Rewards**: Finding treasure grants both points AND a bonus dig attempt
- **Progressive Scoring**: Treasure values decrease based on discovery order:
  - **1st Discovery**: 100 points (maximum reward)
  - **2nd Discovery**: 80 points 
  - **3rd Discovery**: 60 points
  - **4th Discovery**: 40 points
  - **5th Discovery**: 20 points
  - **6th+ Discovery**: 0 points (no reward)

### Strategic Intelligence System

#### Discovery Gap Hints
The game features an innovative "heat map" system that provides strategic intelligence:

- **Sub-Grid Analysis**: The board is divided into 9 sub-regions (3x3 grid)
- **Discovery Gap Logic**: Hints show areas where other players have found more treasures than you
- **Visual Intensity**: Border colors and intensity increase with the "discovery gap"
  - **Yellow**: 1 more discovery than you in this area
  - **Orange**: 2 more discoveries than you
  - **Red**: 3 more discoveries than you  
  - **Dark Red**: 4+ more discoveries than you

#### Hint Intelligence Strategy
- **Information Gathering**: Use other players' discoveries to identify treasure-rich areas
- **Risk Assessment**: Balance early aggressive digging vs. waiting for intelligence
- **Adaptive Hints**: Hints disappear when they become irrelevant (you've caught up in discoveries)
- **Strategic Timing**: Decide when to act on hints vs. when to explore new areas

## Game Modes

### Single Player Mode
- **Solo Exploration**: Focus on efficient treasure hunting without competition
- **Practice Mode**: Perfect your strategy and learn the mechanics
- **Mock 2-Player**: Test multiplayer dynamics locally with alternating turns

### Multiplayer Mode
- **Shared Treasure Layout**: All players hunt the same treasure positions
- **Competitive Scoring**: Race to find treasures first for maximum points
- **Real-time Updates**: See other players' progress and adapt your strategy
- **Game Codes**: Simple 6-character codes (e.g., "ABC123") for easy game joining
- **Automatic Timeouts**: Games auto-cancel if inactive (30min waiting, 2hrs active)

## Strategic Depth

### Early Game Decisions
- **Aggressive Start**: Risk early digs for 100-point treasures before others find them
- **Conservative Approach**: Wait for hint intelligence to develop before committing resources
- **Balanced Strategy**: Mix early exploration with hint-based targeting

### Mid-Game Adaptation
- **Hint Utilization**: Use discovery gap information to identify promising areas
- **Resource Conservation**: Manage remaining digs carefully as opportunities decrease
- **Competitive Awareness**: Track other players' progress and adjust tactics

### End Game Optimization
- **Efficient Targeting**: Focus on areas with the highest probability of undiscovered treasures
- **Point Maximization**: Prioritize treasures that still offer meaningful points
- **Risk Management**: Balance potential rewards against remaining dig attempts

## Technical Features

### Real-time Multiplayer Infrastructure
- **Supabase Backend**: Robust real-time database with automatic synchronization
- **Row Level Security**: Secure multi-player data isolation and access control
- **Automatic Game Management**: Session creation, player joining, and completion detection

### Responsive Design
- **Cross-Device Compatibility**: Optimized for desktop, tablet, and mobile play
- **Adaptive Grid Scaling**: Board automatically adjusts to screen size
- **Touch-Friendly Interface**: Intuitive controls for all device types

### Performance Optimizations
- **Efficient Polling**: Smart update intervals for real-time synchronization
- **Local State Management**: Immediate UI feedback with database synchronization
- **Optimized Rendering**: Smooth animations and transitions

## Game Flow

### Session Creation
1. **Host Setup**: Configure grid size, treasure count, and dig attempts
2. **Code Generation**: Receive unique 6-character game code
3. **Player Invitation**: Share code with other players for joining

### Active Gameplay
1. **Strategic Planning**: Analyze board and available information
2. **Dig Execution**: Make calculated moves based on risk/reward assessment
3. **Hint Analysis**: Use discovery gap intelligence to guide future moves
4. **Adaptive Strategy**: Adjust tactics based on other players' discoveries

### Game Completion
1. **Automatic Detection**: Game ends when all players exhaust their dig attempts
2. **Final Scoring**: Players ranked by total points accumulated
3. **Statistics Display**: Comprehensive game analysis and performance metrics
4. **Replay Options**: Start new games or return to main menu

## Winning Strategies

### Information Advantage
- **Pattern Recognition**: Learn to read hint patterns effectively
- **Timing Optimization**: Know when to act on hints vs. when to explore independently
- **Resource Allocation**: Balance exploration with targeted digging

### Competitive Psychology
- **Early Pressure**: Apply pressure with aggressive early moves
- **Misdirection**: Use your discoveries to influence others' strategies
- **Patience Rewards**: Sometimes waiting for better information pays off

### Risk Management
- **Calculated Risks**: Weigh potential 100-point rewards against dig cost
- **Fallback Plans**: Always have alternative areas to explore
- **Endgame Efficiency**: Maximize final dig attempts when competition is fierce

## Getting Started

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Start development server**: `npm run dev`
4. **Choose game mode**: Single player for practice, multiplayer for competition
5. **Configure settings**: Adjust grid size and treasure count to your preference
6. **Start hunting**: Begin your strategic treasure hunting adventure!

## Contributing

Contributions are welcome! The game's modular architecture makes it easy to add new features, game modes, or strategic elements. Please read our contributing guidelines before submitting pull requests.