// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GameTreasury - fee and reward manager for Firefighters game (native MON)
/// @notice Handles agent registration fees in native MON, hourly reward buckets (90/10),
///         and burning last hour's reward share on Earth collapse by sending it to a burn address.
contract GameTreasury {
    struct AgentInfo {
        address owner;
        uint96  totalPaid; // in wei of native token; plenty for hackathon
        bool    active;
    }

    address public admin;
    address public gameOperator; // backend / oracle that drives epochs and payouts

    // Agent registry
    mapping(bytes32 => AgentInfo) public agents;

    // Economy buckets per "hour" (values denominated in wei of native token)
    uint256 public epoch;              // monotonically increasing "hour" index
    uint256 public currentBucket;      // MON contributed since last closeHour
    uint256 public lastBucket;         // MON contributed during last closed hour
    uint256 public lastBucketReward;   // 90% of lastBucket (potential rewards)
    uint256 public treasuryAccumulated;// Sum of all 10% treasury shares (accounting only)
    bool    public lastBucketSettled;  // true when last bucket has been rewarded or burned

    // 90/10 split constants
    uint256 private constant REWARD_BPS   = 9000; // 90%
    uint256 private constant TREASURY_BPS = 1000; // 10%
    uint256 private constant BPS_DENOM    = 10000;

    event AgentRegistered(bytes32 indexed agentId, address indexed owner, uint256 amount, uint256 epoch);
    event HourClosed(uint256 indexed epoch, uint256 totalContrib, uint256 rewardPortion, uint256 treasuryPortion);
    event LastHourRewardsDistributed(uint256 indexed epoch, uint256 rewardAmount, bytes32[] winners);
    event LastHourRewardsBurned(uint256 indexed epoch, uint256 burnedAmount);
    event GameOperatorChanged(address indexed previousOperator, address indexed newOperator);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    modifier onlyGame() {
        require(msg.sender == gameOperator, "only game");
        _;
    }

    constructor(address _admin, address _gameOperator) {
        require(_admin != address(0), "admin zero");
        require(_gameOperator != address(0), "game zero");

        admin = _admin;
        gameOperator = _gameOperator;
        lastBucketSettled = true; // so first closeHour can run
    }

    // -------- Admin controls --------

    function setGameOperator(address newOperator) external onlyAdmin {
        require(newOperator != address(0), "game zero");
        emit GameOperatorChanged(gameOperator, newOperator);
        gameOperator = newOperator;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "admin zero");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /// @notice Withdraw MON corresponding to accumulated treasury share.
    /// @dev Cannot withdraw more than treasuryAccumulated to preserve reward buckets.
    function withdrawTreasury(address payable to, uint256 amount) external onlyAdmin {
        require(to != address(0), "to zero");
        require(amount > 0, "amount zero");
        require(amount <= treasuryAccumulated, "exceeds treasury");

        treasuryAccumulated -= amount;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    // -------- Game-facing flows --------

    /// @notice Register or top-up an agent by paying native MON.
    /// @param agentId A unique identifier chosen by the backend (e.g. keccak of off-chain id).
    function registerAgent(bytes32 agentId) external payable {
        uint256 amount = msg.value;
        require(amount > 0, "amount zero");

        AgentInfo storage info = agents[agentId];
        if (info.owner == address(0)) {
            info.owner = msg.sender;
            info.active = true;
        } else {
            require(info.owner == msg.sender, "not owner");
        }

        // Safe up to 2^96-1, far beyond expected values
        info.totalPaid += uint96(amount);

        currentBucket += amount;

        emit AgentRegistered(agentId, msg.sender, amount, epoch);
    }

    /// @notice Close the current "hour": move currentBucket to lastBucket and compute splits.
    /// @dev Only callable by gameOperator.
    function closeHour() external onlyGame {
        require(lastBucketSettled, "prev hour unsettled");

        epoch += 1;
        lastBucket = currentBucket;
        currentBucket = 0;

        if (lastBucket > 0) {
            uint256 rewardPortion = (lastBucket * REWARD_BPS) / BPS_DENOM;
            uint256 treasuryPortion = lastBucket - rewardPortion;

            lastBucketReward = rewardPortion;
            treasuryAccumulated += treasuryPortion;

            emit HourClosed(epoch, lastBucket, rewardPortion, treasuryPortion);
        } else {
            lastBucketReward = 0;
            emit HourClosed(epoch, 0, 0, 0);
            // Nothing to settle when there's no bucket.
            lastBucketSettled = true;
            return;
        }

        lastBucketSettled = false;
    }

    /// @notice Distribute last hour's reward portion (90% of contributions) to winners.
    /// @param winners Agent ids selected by the backend as winners.
    /// @param weights Relative weights (e.g. scores); used to split the reward pool.
    function distributeLastHourRewards(
        bytes32[] calldata winners,
        uint256[] calldata weights
    ) external onlyGame {
        require(!lastBucketSettled, "already settled");
        uint256 R = lastBucketReward;
        require(R > 0, "nothing to distribute");
        require(winners.length == weights.length && winners.length > 0, "bad arrays");

        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            totalWeight += weights[i];
        }
        require(totalWeight > 0, "zero weight");

        // Mark as settled before external calls to be safe.
        lastBucketSettled = true;

        uint256 remaining = R;
        for (uint256 i = 0; i < winners.length; i++) {
            AgentInfo storage info = agents[winners[i]];
            address ownerAddr = info.owner;
            if (!info.active || ownerAddr == address(0)) {
                continue;
            }

            uint256 share = (R * weights[i]) / totalWeight;
            if (share == 0) continue;
            if (share > remaining) {
                share = remaining;
            }
            remaining -= share;

            (bool ok, ) = payable(ownerAddr).call{value: share}("");
            require(ok, "reward transfer failed");
        }

        emit LastHourRewardsDistributed(epoch, R - remaining, winners);
    }

    /// @notice Burn last hour's reward portion instead of distributing it (Earth collapse).
    /// @dev 90% of last hour's contributions are burned from the treasury balance.
    function burnLastHourRewardsOnCollapse() external onlyGame {
        require(!lastBucketSettled, "already settled");
        uint256 R = lastBucketReward;
        require(R > 0, "nothing to burn");

        lastBucketSettled = true;

        // Send last hour's reward portion to address(0) as an irreversible burn.
        (bool ok, ) = payable(address(0)).call{value: R}("");
        require(ok, "burn transfer failed");

        emit LastHourRewardsBurned(epoch, R);
    }
}

