import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import { Animated, PanResponder, StyleSheet, View, ViewPropTypes } from 'react-native';

import DefaultControls from './Controls';

const useNativeDriver = false; // because of RN #13377

class Swiper extends PureComponent {

  startAutoplay() {
    const { timeout } = this.props;
    this.stopAutoplay();
    if (timeout) {
      this.autoplay = setTimeout(
        this._autoplayTimeout,
        Math.abs(timeout) * 1000
      );
    }
  }

  stopAutoplay() {
    this.autoplay && clearTimeout(this.autoplay);
  }

  goToNext() {
    this._goToNeighboring();
  }

  goToPrev() {
    this._goToNeighboring(true);
  }

  goTo(index = 0) {
    const delta = index - this.getActiveIndex();
    if (delta) {
      this._fixAndGo(delta);
    }
  }

  getActiveIndex() {
    return this.state.activeIndex;
  }

  // stop public methods

  _autoplayTimeout() {
    const { timeout } = this.props;
    this._goToNeighboring(timeout < 0);
  }

  _goToNeighboring(toPrev = false) {
    this._fixAndGo(toPrev ? -1 : 1);
  }

  constructor(props) {
    super(props);

    this._autoplayTimeout = this._autoplayTimeout.bind(this);
    this._onLayout = this._onLayout.bind(this);
    this._fixState = this._fixState.bind(this);

    this.goToPrev = this.goToPrev.bind(this);
    this.goToNext = this.goToNext.bind(this);
    this.goTo = this.goTo.bind(this);

    this.state = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      activeIndex: props.from,
      pan: new Animated.ValueXY(),
    };

    this._animatedValueX = 0;
    this._animatedValueY = 0;

    this._panResponder = PanResponder.create(this._getPanResponderCallbacks());
  }

  componentDidMount() {
    this.state.pan.x.addListener(({ value }) => (this._animatedValueX = value));
    this.state.pan.y.addListener(({ value }) => (this._animatedValueY = value));
    this.startAutoplay();
  }

  componentWillUnmount() {
    this.stopAutoplay();
    this.state.pan.x.removeAllListeners();
    this.state.pan.y.removeAllListeners();
  }

  _getPanResponderCallbacks() {
    return {
      onPanResponderTerminationRequest: () => false,
      onMoveShouldSetResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (e, gestureState) => {
        const { gesturesEnabled, vertical, minDistanceToCapture } = this.props;

        if (!gesturesEnabled) {
          return false;
        }

        this.props.onAnimationStart &&
          this.props.onAnimationStart(this.getActiveIndex());

        const allow =
          Math.abs(vertical ? gestureState.dy : gestureState.dx) >
          minDistanceToCapture;

        if (allow) {
          this.stopAutoplay();
        }

        return allow;
      },
      onPanResponderGrant: () => this._fixState(),
      onPanResponderMove: Animated.event([
        null,
        this.props.vertical
          ? { dy: this.state.pan.y }
          : { dx: this.state.pan.x },
      ]),
      onPanResponderRelease: (e, gesture) => {
        const { vertical, minDistanceForAction } = this.props;
        const { width, height } = this.state;

        this.startAutoplay();

        const correction = vertical
          ? gesture.moveY - gesture.y0
          : gesture.moveX - gesture.x0;

        if (
          Math.abs(correction) <
          (vertical ? height : width) * minDistanceForAction
        ) {
          this._spring({ x: 0, y: 0 });
        } else {
          this._changeIndex(correction > 0 ? -1 : 1);
        }
      },
    };
  }

  _spring(toValue) {
    const { springConfig, onAnimationEnd } = this.props;
    const { activeIndex } = this.state;
    Animated.spring(this.state.pan, {
      ...springConfig,
      toValue,
      useNativeDriver, // false, see top of file
    }).start(() => onAnimationEnd && onAnimationEnd(activeIndex));
  }

  _fixState() {
    const { vertical } = this.props;
    const { width, height, activeIndex } = this.state;
    this._animatedValueX = vertical ? 0 : width * activeIndex * -1;
    this._animatedValueY = vertical ? height * activeIndex * -1 : 0;
    this.state.pan.setOffset({
      x: this._animatedValueX,
      y: this._animatedValueY,
    });
    this.state.pan.setValue({ x: 0, y: 0 });
  }

  _fixAndGo(delta) {
    this._fixState();
    this.props.onAnimationStart &&
      this.props.onAnimationStart(this.getActiveIndex());
    this._changeIndex(delta);
  }

  _changeIndex(delta = 1) {
    const { loop, vertical, children: {length: count} } = this.props;
    const { width, height, activeIndex } = this.state;

    let toValue = { x: 0, y: 0 };
    let skipChanges = !delta;
    let calcDelta = delta;

    if (activeIndex <= 0 && delta < 0) {
      skipChanges = !loop;
      calcDelta = count + delta;
    } else if (activeIndex + 1 >= count && delta > 0) {
      skipChanges = !loop;
      calcDelta = -1 * activeIndex + delta - 1;
    }

    if (skipChanges) {
      return this._spring(toValue);
    }

    this.stopAutoplay();

    let index = activeIndex + calcDelta;
    this.setState({ activeIndex: index });

    if (vertical) {
      toValue.y = height * -1 * calcDelta;
    } else {
      toValue.x = width * -1 * calcDelta;
    }
    this._spring(toValue);

    this.startAutoplay();
    this.props.onIndexChanged && this.props.onIndexChanged(index);
  }

  _onLayout({
    nativeEvent: {
      layout: { x, y, width, height },
    },
  }) {
    this.setState({ x, y, width, height }, () => this._fixState());
  }

  render() {
    const { pan, x, y, width, height } = this.state;

    const {
      theme,
      loop,
      vertical,
      positionFixed,
      containerStyle,
      innerContainerStyle,
      swipeAreaStyle,
      slideWrapperStyle,
      controlsEnabled,
      controlsProps,
      children,
      Controls = DefaultControls,
    } = this.props;
    const {length: count} = children;

    return (
      <View
        style={StyleSheet.flatten([styles.root, containerStyle])}
        onLayout={this._onLayout}
      >
        <View
          style={StyleSheet.flatten([
            styles.container(positionFixed, x, y, width, height),
            innerContainerStyle,
          ])}
        >
          <Animated.View
            style={StyleSheet.flatten([
              styles.swipeArea(vertical, count, width, height),
              swipeAreaStyle,
              {
                transform: [{ translateX: pan.x }, { translateY: pan.y }],
              },
            ])}
            {...this._panResponder.panHandlers}
          >
            {children.map((el, i) => (
              <View
                key={i}
                style={StyleSheet.flatten([
                  { width, height },
                  slideWrapperStyle,
                ])}
              >
                {el}
              </View>
            ))}
          </Animated.View>
          {controlsEnabled && (
            <Controls
              {...controlsProps}
              theme={theme}
              vertical={vertical}
              count={count}
              activeIndex={this.getActiveIndex()}
              isFirst={!loop && !this.getActiveIndex()}
              isLast={!loop && this.getActiveIndex() + 1 >= count}
              goToPrev={this.goToPrev}
              goToNext={this.goToNext}
              goTo={this.goTo}
            />
          )}
        </View>
      </View>
    );
  }
}

Swiper.propTypes = {
  vertical: PropTypes.bool,
  from: PropTypes.number,
  loop: PropTypes.bool,
  timeout: PropTypes.number,
  gesturesEnabled: PropTypes.bool,
  springConfig: PropTypes.object,
  minDistanceToCapture: PropTypes.number, // inside ScrollView
  minDistanceForAction: PropTypes.number,

  onAnimationStart: PropTypes.func,
  onAnimationEnd: PropTypes.func,
  onIndexChanged: PropTypes.func,

  positionFixed: PropTypes.bool, // Fix safari vertical bounces
  containerStyle: ViewPropTypes.style,
  innerContainerStyle: ViewPropTypes.style,
  swipeAreaStyle: ViewPropTypes.style,
  slideWrapperStyle: ViewPropTypes.style,

  controlsEnabled: PropTypes.bool,
  controlsProps: PropTypes.shape(DefaultControls.propTypes),
  Controls: PropTypes.func,

  theme: PropTypes.object,
};

Swiper.defaultProps = {
  vertical: false,
  from: 0,
  loop: false,
  timeout: 0,
  gesturesEnabled: true,
  minDistanceToCapture: 5,
  minDistanceForAction: 0.2,
  positionFixed: false,
  controlsEnabled: true,
};

const styles = {
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // Fix web vertical scaling (like expo v33-34)
  container: (positionFixed, x, y, width, height) => ({
    backgroundColor: 'transparent',
    // Fix safari vertical bounces
    position: positionFixed ? 'fixed' : 'relative',
    overflow: 'hidden',
    top: positionFixed ? y : 0,
    left: positionFixed ? x : 0,
    width,
    height,
    justifyContent: 'space-between',
  }),
  swipeArea: (vertical, count, width, height) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: vertical ? width : width * count,
    height: vertical ? height * count : height,
    flexDirection: vertical ? 'column' : 'row',
  }),
};

export { Swiper };
