import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { registerTvBackKey } from './tv-back-key';
describe('registerTvBackKey', () => {
    const app = () => {
        const addListener = jest.fn(async () => ({ remove: jest.fn() }));
        return {
            addListener,
            load: jest.fn(async () => ({ App: { addListener } })),
        };
    };

    it('does not load @capacitor/app outside a native shell', async () => {
        const { load } = app();

        await registerTvBackKey(
            { isNativeShell: false } as RuntimeCapabilitiesService,
            jest.fn(),
            load
        );

        expect(load).not.toHaveBeenCalled();
    });

    it("sends the remote's Back key to the handler on a native shell", async () => {
        const { addListener, load } = app();
        const handleBack = jest.fn();

        await registerTvBackKey(
            { isNativeShell: true } as RuntimeCapabilitiesService,
            handleBack,
            load
        );

        expect(addListener).toHaveBeenCalledWith(
            'backButton',
            expect.any(Function)
        );
        (addListener.mock.calls[0] as unknown as [string, () => void])[1]();
        expect(handleBack).toHaveBeenCalled();
    });
});
