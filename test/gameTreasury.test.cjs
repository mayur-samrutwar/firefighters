const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameTreasury (native MON)", function () {
  async function deployFixture() {
    const [admin, gameOperator, user1, user2] = await ethers.getSigners();

    const GameTreasury = await ethers.getContractFactory("GameTreasury");
    const treasury = await GameTreasury.deploy(
      admin.address,
      gameOperator.address
    );

    return { admin, gameOperator, user1, user2, treasury };
  }

  it("registers agents and tracks buckets", async () => {
    const { user1, treasury } = await deployFixture();

    const fee = ethers.parseEther("1.0");

    const agentId = ethers.encodeBytes32String("agent-sammy");
    await expect(
      treasury.connect(user1).registerAgent(agentId, { value: fee })
    ).to.emit(treasury, "AgentRegistered");

    const info = await treasury.agents(agentId);
    expect(info.owner).to.equal(user1.address);
    expect(info.totalPaid).to.equal(fee);

    const currentBucket = await treasury.currentBucket();
    expect(currentBucket).to.equal(fee);
  });

  it("prevents non-owner from topping up same agentId", async () => {
    const { user1, user2, treasury } = await deployFixture();

    const fee = ethers.parseEther("1");
    const agentId = ethers.encodeBytes32String("agent-1");

    await treasury.connect(user1).registerAgent(agentId, { value: fee });

    await expect(
      treasury.connect(user2).registerAgent(agentId, { value: fee })
    ).to.be.revertedWith("not owner");
  });

  it("closes hour and splits 90/10", async () => {
    const { gameOperator, user1, treasury } = await deployFixture();

    const fee = ethers.parseEther("1.0");

    const agentId = ethers.encodeBytes32String("agent-1");
    await treasury.connect(user1).registerAgent(agentId, { value: fee });

    // close hour
    await treasury.connect(gameOperator).closeHour();

    const lastBucket = await treasury.lastBucket();
    const lastBucketReward = await treasury.lastBucketReward();
    const treasuryAccumulated = await treasury.treasuryAccumulated();

    expect(lastBucket).to.equal(fee);
    expect(lastBucketReward).to.equal((fee * 9000n) / 10000n);
    expect(treasuryAccumulated).to.equal(fee - lastBucketReward);
  });

  it("only game operator can close hour and distribute/burn", async () => {
    const { gameOperator, user1, treasury } = await deployFixture();
    const fee = ethers.parseEther("0.5");

    const agentId = ethers.encodeBytes32String("agent-1");
    await treasury.connect(user1).registerAgent(agentId, { value: fee });

    await expect(treasury.connect(user1).closeHour()).to.be.revertedWith(
      "only game"
    );

    await treasury.connect(gameOperator).closeHour();

    const winners = [agentId];
    const weights = [1];

    await expect(
      treasury.connect(user1).distributeLastHourRewards(winners, weights)
    ).to.be.revertedWith("only game");

    await expect(
      treasury.connect(user1).burnLastHourRewardsOnCollapse()
    ).to.be.revertedWith("only game");
  });

  it("distributes last hour rewards to winners", async () => {
    const { gameOperator, user1, user2, treasury } =
      await deployFixture();

    const fee1 = ethers.parseEther("0.6");
    const fee2 = ethers.parseEther("0.4");

    const agent1 = ethers.encodeBytes32String("agent-1");
    const agent2 = ethers.encodeBytes32String("agent-2");

    await treasury.connect(user1).registerAgent(agent1, { value: fee1 });
    await treasury.connect(user2).registerAgent(agent2, { value: fee2 });

    const balBefore1 = await ethers.provider.getBalance(user1.address);
    const balBefore2 = await ethers.provider.getBalance(user2.address);

    await treasury.connect(gameOperator).closeHour();
    const lastBucketReward = await treasury.lastBucketReward();

    // weights: agent1:2, agent2:1 → agent1 gets 2/3, agent2 gets 1/3
    const winners = [agent1, agent2];
    const weights = [2, 1];

    await treasury
      .connect(gameOperator)
      .distributeLastHourRewards(winners, weights);

    const balAfter1 = await ethers.provider.getBalance(user1.address);
    const balAfter2 = await ethers.provider.getBalance(user2.address);

    // because of gas costs we only assert relative gains, not exact equality
    expect(balAfter1).to.be.gt(balBefore1);
    expect(balAfter2).to.be.gt(balBefore2);

    // bucket marked settled; second call should fail
    await expect(
      treasury
        .connect(gameOperator)
        .distributeLastHourRewards(winners, weights)
    ).to.be.revertedWith("already settled");
  });

  it("burns last hour rewards on collapse", async () => {
    const { gameOperator, user1, treasury } = await deployFixture();

    const fee = ethers.parseEther("1.0");
    const agentId = ethers.encodeBytes32String("agent-1");

    await treasury.connect(user1).registerAgent(agentId, { value: fee });

    await treasury.connect(gameOperator).closeHour();
    const lastBucketReward = await treasury.lastBucketReward();

    const balBefore = await ethers.provider.getBalance(treasury.target);
    await treasury.connect(gameOperator).burnLastHourRewardsOnCollapse();
    const balAfter = await ethers.provider.getBalance(treasury.target);

    expect(balBefore - balAfter).to.equal(lastBucketReward);

    // cannot burn again
    await expect(
      treasury.connect(gameOperator).burnLastHourRewardsOnCollapse()
    ).to.be.revertedWith("already settled");
  });
});

