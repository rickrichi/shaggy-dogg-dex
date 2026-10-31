import { screen } from "@testing-library/react";

import { poolPlannerForVenue } from "@/config/dex-venues";
import { render, userEvent } from "@/test/utils";

import { DexPoolPlanner } from "./DexPoolPlanner";

const pancakeV3 = poolPlannerForVenue("PancakeSwap V3")!;
const pancakeV2 = poolPlannerForVenue("PancakeSwap V2")!;
const sushiV2 = poolPlannerForVenue("SushiSwap V2")!;
const uniswapV2 = poolPlannerForVenue("Uniswap V2")!;

const address = "0x1234567890123456789012345678901234567890" as const;

const renderPlanner = (
  props: Partial<React.ComponentProps<typeof DexPoolPlanner>> = {},
) =>
  render(
    <DexPoolPlanner
        planner={pancakeV3}
      tokenKey="token-a"
      tokenName="Mutt Rewards"
      tokenSymbol="MRWD"
      tokenAddress={address}
      quoteSymbol="WETH"
      poolExists={false}
      {...props}
    />,
  );

describe("DexPoolPlanner", () => {
  it("shows the selected pair, full address, exact fee tiers, and default tier", () => {
    renderPlanner();
    expect(screen.getByText("MRWD/WETH")).toBeInTheDocument();
    expect(screen.getByText(address)).toBeInTheDocument();
    for (const fee of ["0.01%", "0.05%", "0.25%", "1%"])
      expect(
        screen.getByRole("button", {
          name: new RegExp(`^${fee.replace(".", "\\.")}`),
        }),
      ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /0\.25%/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("derives both prices and gates the official handoff on amounts and acknowledgements", async () => {
    const user = userEvent.setup();
    renderPlanner();
    const cta = screen.getByRole("button", { name: /continue on pancakeswap/i });
    expect(cta).toBeDisabled();

    await user.type(screen.getByLabelText("MRWD amount"), "4");
    await user.type(screen.getByLabelText("WETH amount"), "2");
    expect(screen.getByText(/1 MRWD = 0\.5 WETH/)).toBeInTheDocument();
    expect(screen.getByText(/1 WETH = 2 MRWD/)).toBeInTheDocument();
    expect(cta).toBeDisabled();

    const checks = screen.getAllByRole("checkbox");
    await user.click(checks[0]!);
    await user.click(checks[1]!);
    const link = screen.getByRole("link", { name: /continue on pancakeswap/i });
    expect(link).toHaveAttribute("href", "https://pancakeswap.finance/liquidity/pools");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps zero and malformed amounts invalid", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.type(screen.getByLabelText("MRWD amount"), "0");
    await user.type(screen.getByLabelText("WETH amount"), "not-a-number");
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    expect(screen.queryByText("Implied price")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue on pancakeswap/i })).toBeDisabled();
  });

  it("resets prepared values and acknowledgements when the token changes", async () => {
    const user = userEvent.setup();
    const view = renderPlanner();
    await user.type(screen.getByLabelText("MRWD amount"), "10");
    await user.type(screen.getByLabelText("WETH amount"), "1");
    await user.click(screen.getAllByRole("checkbox")[0]!);
    view.rerender(
      <DexPoolPlanner
        planner={pancakeV3}
        tokenKey="token-b"
        tokenName="Second Token"
        tokenSymbol="TWO"
        tokenAddress="0x2222222222222222222222222222222222222222"
        quoteSymbol="WETH"
        poolExists={false}
      />,
    );
    expect(screen.getByLabelText("TWO amount")).toHaveValue("");
    expect(screen.getByLabelText("WETH amount")).toHaveValue("");
    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
  });

  it("explains ETH wrapping and switches first-price wording for an existing pool", () => {
    const view = renderPlanner({ tokenSymbol: "ETH", native: true });
    expect(screen.getByText(/Native ETH is paired as WETH/)).toBeInTheDocument();
    view.rerender(
      <DexPoolPlanner
        planner={pancakeV3}
        tokenKey="weth"
        tokenName="Wrapped Ether"
        tokenSymbol="WETH"
        tokenAddress="0x4200000000000000000000000000000000000006"
        quoteSymbol="USDC"
        poolExists
      />,
    );
    expect(screen.getByRole("heading", { name: "Add PancakeSwap V3 liquidity" })).toBeInTheDocument();
    expect(screen.getByText(/verify the pool price and my deposit ratio/i)).toBeInTheDocument();
    expect(screen.queryByText(/first liquidity position initializes/i)).not.toBeInTheDocument();
  });

  it("offers planners only for venues with a verified handoff", () => {
    expect(pancakeV3.protocol).toBe("v3");
    expect(pancakeV2.swapFee).toBe("0.25%");
    expect(sushiV2.swapFee).toBe("0.30%");
    expect(uniswapV2.swapFee).toBe("0.30%");
    expect(poolPlannerForVenue("BaseSwap")).toBeUndefined();
  });

  it("uses Uniswap's fee, handoff, and rewards wording", async () => {
    const user = userEvent.setup();
    renderPlanner({ planner: uniswapV2, poolExists: true, poolActive: true });
    expect(screen.getByRole("heading", { name: "Add Uniswap V2 liquidity" })).toBeInTheDocument();
    expect(screen.getByText("Standard 0.30% swap fee")).toBeInTheDocument();
    expect(screen.getByText(/Uniswap matches your second amount/)).toBeInTheDocument();
    expect(screen.getByText(/a separately funded incentive is independently verified/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("MRWD amount"), "4");
    await user.type(screen.getByLabelText("WETH amount"), "2");
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    expect(screen.getByRole("link", { name: /continue on uniswap/i })).toHaveAttribute(
      "href",
      "https://app.uniswap.org/positions/create/v2?chain=base",
    );
  });

  it("uses SushiSwap's fee, handoff, and rewards wording", async () => {
    const user = userEvent.setup();
    renderPlanner({ planner: sushiV2, poolExists: true, poolActive: true });
    expect(screen.getByRole("heading", { name: "Add SushiSwap V2 liquidity" })).toBeInTheDocument();
    expect(screen.getByText("Standard 0.30% swap fee")).toBeInTheDocument();
    expect(screen.getByText(/SushiSwap matches your second amount/)).toBeInTheDocument();
    expect(screen.getByText(/a separately funded incentive is independently verified/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("MRWD amount"), "4");
    await user.type(screen.getByLabelText("WETH amount"), "2");
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    expect(screen.getByRole("link", { name: /continue on sushiswap/i })).toHaveAttribute(
      "href",
      "https://www.sushi.com/base/pool/v2/add",
    );
  });

  it("replaces fee tiers and ranges with the fixed V2 model", () => {
    renderPlanner({ planner: pancakeV2 });
    expect(screen.getByRole("heading", { name: "Create a PancakeSwap V2 pool" })).toBeInTheDocument();
    expect(screen.getByText("Standard 0.25% swap fee")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^0\.01%/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Range plan/)).not.toBeInTheDocument();
    expect(screen.getByText("04 · Confirm risks")).toBeInTheDocument();
    expect(screen.getByText(/fungible LP tokens across the full price range/)).toBeInTheDocument();
    expect(screen.getByText(/Pool creation earns trading fees only/)).toBeInTheDocument();
    expect(screen.queryByText(/pool ratio decides your deposit/)).not.toBeInTheDocument();
  });

  it("explains that reserves fix the ratio on an active V2 pair", () => {
    renderPlanner({ planner: pancakeV2, poolExists: true, poolActive: true });
    expect(screen.getByRole("heading", { name: "Add PancakeSwap V2 liquidity" })).toBeInTheDocument();
    expect(screen.getByText(/pool ratio decides your deposit/)).toBeInTheDocument();
    expect(screen.getByText(/let PancakeSwap match the pool ratio/)).toBeInTheDocument();
    expect(screen.getByText(/Adding liquidity earns trading fees only/)).toBeInTheDocument();
  });

  it("warns that a V2 pair without confirmed reserves can still be priced by a first deposit", () => {
    renderPlanner({ planner: pancakeV2, poolExists: true, poolActive: false });
    expect(screen.getByText(/your first deposit sets the price/)).toBeInTheDocument();
    expect(screen.queryByText(/pool ratio decides your deposit/)).not.toBeInTheDocument();
  });
});
