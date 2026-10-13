import { channelKeyDirection } from './remote-channel-navigation';

describe('channelKeyDirection', () => {
    const key = (key: string, init: KeyboardEventInit = {}) =>
        new KeyboardEvent('keydown', { key, ...init });

    it('moves to the next channel with ChannelUp, as the Media3 player does', () => {
        expect(channelKeyDirection(key('ChannelUp'))).toBe('down');
    });

    it('moves to the previous channel with ChannelDown', () => {
        expect(channelKeyDirection(key('ChannelDown'))).toBe('up');
    });

    it('ignores other keys, modified keys and handled events', () => {
        expect(channelKeyDirection(key('ArrowUp'))).toBeNull();
        expect(
            channelKeyDirection(key('ChannelUp', { ctrlKey: true }))
        ).toBeNull();
        const handled = new KeyboardEvent('keydown', {
            key: 'ChannelUp',
            cancelable: true,
        });
        handled.preventDefault();
        expect(channelKeyDirection(handled)).toBeNull();
    });
});
