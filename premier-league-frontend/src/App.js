// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import './App.css'; // Assuming you still have some basic styling here

function App() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]); // New state for teams
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for filters
  const [positionFilter, setPositionFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState(''); // Stores team_id
  const [statusFilter, setStatusFilter] = useState('');

  // State for sorting
  const [sortBy, setSortBy] = useState('total_points');
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' or 'desc'

  // Function to fetch players based on current filters and sort options
  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (positionFilter) params.append('position', positionFilter);
      if (teamFilter) params.append('team_id', teamFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (sortBy) params.append('sort_by', sortBy);
      if (sortOrder) params.append('order', sortOrder);

      const queryString = params.toString();
      const url = `/api/players${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setPlayers(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching players:", err);
    } finally {
      setLoading(false);
    }
  }, [positionFilter, teamFilter, statusFilter, sortBy, sortOrder]);

  // Function to fetch teams
  const fetchTeams = useCallback(async () => {
    try {
      const response = await fetch('/api/teams');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTeams(data);
    } catch (err) {
      console.error("Error fetching teams:", err);
    }
  }, []);


  // Initial fetch for players and teams on component mount
  useEffect(() => {
    fetchPlayers();
    fetchTeams();
  }, [fetchPlayers, fetchTeams]); // Re-run if fetchPlayers/fetchTeams dependencies change (they are useCallback memoized)

  // Handle sorting clicks (toggle asc/desc if clicking same column)
  const handleSortClick = (column) => {
    if (sortBy === column) {
      setSortOrder(prevOrder => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc'); // Default to descending for new sort column
    }
  };


  if (loading && players.length === 0 && teams.length === 0) { // Initial loading state
    return <div className="App">Loading data...</div>;
  }

  if (error) {
    return <div className="App">Error: {error}. Please check your backend server and database.</div>;
  }

  // Define position options (should match values in your DB)
  const positionOptions = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
  // Define status options (FPL API values)
  const statusOptions = [
    { value: 'a', label: 'Available' },
    { value: 'i', label: 'Injured' },
    { value: 'd', label: 'Doubtful' },
    { value: 's', label: 'Suspended' },
    { value: 'u', label: 'Unavailable' } // 'u' for unknown/unavailable
  ];


  return (
    <div className="App">
      <header className="App-header">
        <h1>Premier League Players</h1>
        <h2>(from your Dockerized Backend!)</h2>
      </header>

      <div className="filters-sort-container">
        {/* Filters */}
        <div className="filters">
          <label>Position:</label>
          <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
            <option value="">All Positions</option>
            {positionOptions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>

          <label>Team:</label>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">All Teams</option>
            {teams.map(team => (
              <option key={team.team_id} value={team.team_id}>{team.name}</option>
            ))}
          </select>

          <label>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map(status => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>

        {/* Sorting Buttons (you could also use a dropdown) */}
        <div className="sorting">
          <span>Sort by: </span>
          <button onClick={() => handleSortClick('web_name')} className={sortBy === 'web_name' ? 'active' : ''}>Name {sortBy === 'web_name' && (sortOrder === 'asc' ? '▲' : '▼')}</button>
          <button onClick={() => handleSortClick('total_points')} className={sortBy === 'total_points' ? 'active' : ''}>Points {sortBy === 'total_points' && (sortOrder === 'asc' ? '▲' : '▼')}</button>
          <button onClick={() => handleSortClick('now_cost')} className={sortBy === 'now_cost' ? 'active' : ''}>Cost {sortBy === 'now_cost' && (sortOrder === 'asc' ? '▲' : '▼')}</button>
          <button onClick={() => handleSortClick('goals_scored')} className={sortBy === 'goals_scored' ? 'active' : ''}>Goals {sortBy === 'goals_scored' && (sortOrder === 'asc' ? '▲' : '▼')}</button>
          <button onClick={() => handleSortClick('assists')} className={sortBy === 'assists' ? 'active' : ''}>Assists {sortBy === 'assists' && (sortOrder === 'asc' ? '▲' : '▼')}</button>
          <button onClick={() => handleSortClick('form')} className={sortBy === 'form' ? 'active' : ''}>Form {sortBy === 'form' && (sortOrder === 'asc' ? '▲' : '▼')}</button>
        </div>
      </div>

      {loading && <p>Loading players...</p>} {/* Show loading only when actively fetching after initial load */}

      {!loading && players.length === 0 && (
        <p>No players found matching your criteria. Try adjusting filters.</p>
      )}

      {!loading && players.length > 0 && (
        <div className="players-table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Pos</th>
                <th>Cost</th>
                <th>Points</th>
                <th>Goals</th>
                <th>Assists</th>
                <th>Form</th>
                <th>Status</th>
                <th>News</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => (
                <tr key={player.player_id}>
                  <td>{player.web_name}</td>
                  <td>{player.team_name}</td>
                  <td>{player.position}</td>
                  <td>£{player.now_cost.toFixed(1)}m</td> {/* Format cost */}
                  <td>{player.total_points}</td>
                  <td>{player.goals_scored}</td>
                  <td>{player.assists}</td>
                  <td>{player.form}</td>
                  <td>{player.status === 'a' ? 'Available' : player.status === 'i' ? 'Injured' : player.status === 'd' ? 'Doubtful' : player.status}</td>
                  <td>{player.news || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;